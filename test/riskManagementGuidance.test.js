const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const nodes=new Map();
 function node(id=''){
   const attributes=new Map(),classes=new Set();
   const item={id,value:'',textContent:'',disabled:false,hidden:false,innerHTML:'',open:false,parentElement:null,
     classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
     setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key)||null,removeAttribute:key=>attributes.delete(key),
     addEventListener(){},querySelectorAll:()=>[],scrollIntoView(){item.scrolled=true;},focus(){item.focused=true;},close(){item.open=false;},reset(){},
     after(hint){nodes.set(hint.id,hint);},remove(){nodes.delete(item.id);}
   };return item;
 }
 const $=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
 const context=vm.createContext({$,canPerform:()=>true,riskManagementRows:[],riskRegisterColumns:[],escapeHtml:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{querySelectorAll:selector=>selector==='.rw-needs-input'?[...nodes.values()].filter(input=>input.classList.contains('rw-needs-input')):[],createElement:()=>node()}});
vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/risk-management/workflow.js','utf8'),context);return {context,nodes};}
test('guidance distinguishes initial assessment, treatment, acceptance and verification requirements',()=>{
 const {context}=fixture();
 const draft=vm.runInContext("rwGuidance({stage:'Draft'},{})",context);assert.ok(draft.missing.includes('Risk owner (Data risiko)'));assert.ok(draft.missing.includes('Threat (Penilaian)'));
 const acceptance=vm.runInContext("rwGuidance({stage:'Assessed'},{treatmentAction:'Acceptance'})",context);assert.ok(acceptance.missing.includes('Form acceptance disahkan (Acceptance)'));assert.ok(!acceptance.missing.includes('Target likelihood (Alur risiko)'));
 const treatment=vm.runInContext("rwGuidance({stage:'In Treatment',progress:100,evidence:'report'},{})",context);assert.equal(treatment.missing.length,0);
 const verify=vm.runInContext("rwGuidance({stage:'Pending Verification',reviewer:'reviewer'},{})",context);assert.match(verify.description,/reviewer/);assert.ok(verify.missing.includes('Residual likelihood (Data risiko)'));
});
test('approval and verification actions remain restricted to the designated independent account',()=>{
 const {context}=fixture();vm.runInContext("rwIdentity={username:'author',role:'editor'}",context);
 assert.equal(vm.runInContext("rwAvailable({stage:'Pending Approval',approver:'chief',submittedBy:'author'}).includes('approve')",context),false);
 vm.runInContext("rwIdentity={username:'chief',role:'approver'}",context);
 assert.equal(vm.runInContext("rwAvailable({stage:'Pending Approval',approver:'chief',submittedBy:'author'}).includes('approve')",context),true);
 assert.equal(vm.runInContext("rwAvailable({stage:'Pending Verification',reviewer:'chief',implementedBy:'chief'}).includes('verify')",context),false);
 context.canPerform=()=>false;assert.equal(vm.runInContext("rwAvailable({stage:'Draft'}).length",context),0);
});
test('effective review-required status explains why reassessment is needed',()=>{
 const {context}=fixture();const guide=vm.runInContext("rwGuidance({stage:'Accepted',effectiveStage:'Review Required'},{})",context);assert.match(guide.title,/ulang/);assert.match(guide.description,/masa berlaku/);
});
test('saving then continuing opens workflow only after successful persistence and refresh',async()=>{
 const {context,nodes}=fixture();const source=fs.readFileSync('frontend/client/src/workspace/features/personnel/organization-and-forms.js','utf8');
 vm.runInContext(source.slice(source.indexOf('async function saveRiskManagement('),source.indexOf('async function deleteRiskManagement(')),context);
 const sequence=[];context.riskManagementData=()=>({riskId:'CSR - AUTO',identificationRisk:'Draft'});context.resetRiskManagementForm=()=>{};context.loadRiskManagement=async()=>sequence.push('refresh');context.rwOpen=async id=>sequence.push(id);context.setRiskManagementTab=()=>{};
 context.fetch=async()=>({ok:true,json:async()=>({riskId:'CSR - 123'})});context.event={preventDefault(){},submitter:{hasAttribute:()=>true}};
 await vm.runInContext('saveRiskManagement(event)',context);assert.deepEqual(sequence,['refresh','CSR - 123']);assert.equal(nodes.get('rmSaveFeedback').hidden,false);
 sequence.length=0;context.fetch=async()=>({ok:false,json:async()=>({error:'Validation failed'})});await vm.runInContext('saveRiskManagement(event)',context);assert.deepEqual(sequence,[]);assert.equal(nodes.get('riskRegisterStatus').textContent,'Validation failed');
});

test('missing and invalid values identify exact form targets',()=>{
 const {context}=fixture();
 const guide=vm.runInContext("rwGuidance({stage:'Draft',currentLikelihood:0,currentImpact:6},{riskOwner:'',likelihood:2,impact:3})",context);
 assert.ok(guide.issues.some(issue=>issue.id==='rmRiskOwner'&&issue.location==='register'));
 assert.ok(guide.issues.some(issue=>issue.id==='rwCurrentLikelihood'&&issue.reason==='harus bernilai 1-5'));
 const dates=vm.runInContext("rwGuidance({stage:'Assessed'},{treatmentAction:'Mitigation',deadline:'2000-01-01'})",context);
 assert.ok(dates.issues.some(issue=>issue.id==='rmDeadline'&&issue.reason.includes('sebelum hari ini')));
});
test('live guide highlights incomplete fields, clears fixed errors and focuses inside collapsed sections',()=>{
 const {context,nodes}=fixture();
 vm.runInContext("rwRiskId='CSR-1';rwData={stage:'Draft'};rwIdentity={username:'author',role:'editor'};rwRenderGuide(rwLiveData(),false)",context);
 const threat=nodes.get('rwThreat');assert.ok(threat.classList.contains('rw-needs-input'));assert.equal(threat.getAttribute('aria-invalid'),'true');
 assert.match(nodes.get('rwGuide').innerHTML,/data-rw-focus="rwThreat"/);
 threat.value='Ransomware';vm.runInContext('rwRenderGuide(rwLiveData(),false)',context);
 assert.equal(threat.classList.contains('rw-needs-input'),false);assert.equal(threat.getAttribute('aria-invalid'),null);
 const section={tagName:'DETAILS',open:false,parentElement:null};threat.parentElement=section;
 vm.runInContext("rwFocusIssue('rwThreat')",context);assert.equal(section.open,true);assert.equal(threat.focused,true);assert.equal(threat.scrolled,true);
 assert.ok(nodes.get('rwReason').classList.contains('rw-needs-input'));
});
test('clicking a register issue opens the same risk and targets the required input',()=>{
 const {context,nodes}=fixture();const risk={riskId:'CSR-1'};context.riskManagementRows=[risk];
 vm.runInContext("rwRiskId='CSR-1';rwData={stage:'Draft'}",context);
 context.fillRiskManagementForm=row=>{assert.equal(row,risk);context.$('riskRegisterOriginalId').value=row.riskId;};
 // Make saved values match all empty workflow inputs so navigation is safe.
 vm.runInContext("rwData=rwLiveData();rwFocusIssue('rmRiskOwner')",context);
 assert.equal(nodes.get('rmRiskOwner').focused,true);assert.ok(nodes.get('rmRiskOwner').classList.contains('rw-needs-input'));
 assert.equal(vm.runInContext('rwReturnAfterEdit',context),'CSR-1');
});

test('complete guidance names the actual next decision instead of asking to complete assessment',()=>{
 const {context,nodes}=fixture();
 vm.runInContext("rwRiskId='CSR-1';rwData={stage:'In Treatment'};rwField('progress').value='100';rwField('evidence').value='report';$('rwReason').value='Reviewed';rwData=rwLiveData();rwRenderGuide(rwData,false)",context);
 assert.match(nodes.get('rwGuide').innerHTML,/Siap: Ajukan verifikasi/);
 assert.doesNotMatch(nodes.get('rwGuide').innerHTML,/Periksa data dan tanggal sebelum/);
});
