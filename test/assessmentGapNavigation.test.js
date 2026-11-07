const {readSourceGroup}=require('../scripts/lib/runtime-manifest.cjs');
const gapSource=readSourceGroup('assessment-gaps');
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const title={},focus=[],dialog={scrollTop:740,querySelectorAll:()=>[{dataset:{gapEdit:'gap-9'},focus:()=>focus.push('origin')}]};
 const form={querySelector:()=>({focus:()=>focus.push('form')})};
 const context=vm.createContext({escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),document:{addEventListener(){}},$:id=>id==='gapDialogTitle'?title:form});
 vm.runInContext(gapSource,context);
 context.dialog=dialog;
 vm.runInContext("gapDialog=()=>dialog;renderGapDialog=()=>{};gapContext={frameworks:['csf','privacy'],code:'',filter:'Open',editing:null};gapPage=3;",context);
 return {context,dialog,title,focus};
}
test('monitor edit focuses the form and returns to the original filter, page, scroll and item',()=>{
 const {context,dialog,title,focus}=fixture();
 vm.runInContext("beginAssessmentGapEdit({dataset:{gapEdit:'gap-9',gapFramework:'privacy',gapControl:'ID-P1'}})",context);
 assert.equal(vm.runInContext('gapContext.editing',context),'gap-9');
 assert.equal(vm.runInContext('gapPage',context),1);
 assert.equal(dialog.scrollTop,0);assert.deepEqual(focus,['form']);
 vm.runInContext('finishAssessmentGapEdit()',context);
 assert.equal(vm.runInContext('gapContext.filter',context),'Open');
 assert.equal(vm.runInContext('gapContext.frameworks.join()',context),'csf,privacy');
 assert.equal(vm.runInContext('gapPage',context),3);
 assert.equal(dialog.scrollTop,740);assert.deepEqual(focus,['form','origin']);
 assert.equal(title.textContent,'Pemantauan gap assessment');
});
test('return remains valid when the edited gap no longer matches the original filter',()=>{
 const {context,dialog}=fixture();dialog.querySelectorAll=()=>[];
 vm.runInContext("beginAssessmentGapEdit({dataset:{gapEdit:'gap-9',gapFramework:'csf',gapControl:'GV.OC-01'}});finishAssessmentGapEdit()",context);
 assert.equal(vm.runInContext('gapContext.filter',context),'Open');assert.equal(dialog.scrollTop,740);
});
test('successful save returns to monitoring while failed save keeps editing open',async()=>{
 const {context}=fixture();
 const submit={disabled:false},message={};
 const elements={description:{value:'Updated'},status:{value:'Closed'}};
 for(const key of ['domain','sub','dimension','gapNumber','client','pic','initiative','recommendation','yearOfInitiative','quarter','confirmation','supportingDocuments','decisionNote'])elements['gap-'+key]={value:key==='decisionNote'?'Comply':''};
 context.event={preventDefault(){},target:{elements,querySelector:()=>submit}};
 context.message=message;context.failed=true;context.window={dispatchEvent(){}};context.CustomEvent=class {};
 context.fetch=async()=>({ok:!context.failed,json:async()=>({error:'Save failed'})});
 vm.runInContext("beginAssessmentGapEdit({dataset:{gapEdit:'gap-9',gapFramework:'csf',gapControl:'GV.OC-01'}});gapContext.editingRow={id:'gap-9'};gapContext.draftEvidence=[];loadAssessmentGaps=async()=>{};$=()=>message;",context);
 await vm.runInContext('saveAssessmentGap(event)',context);
 assert.equal(vm.runInContext('gapContext.editing',context),'gap-9');assert.equal(message.textContent,'Save failed');assert.equal(submit.disabled,false);
 context.failed=false;
 await vm.runInContext('saveAssessmentGap(event)',context);
 assert.equal(vm.runInContext('gapContext.filter',context),'Open');assert.equal(vm.runInContext('gapPage',context),3);assert.equal(submit.disabled,false);
});
test('CSF automatic fields and standardized initiative controls render correctly',()=>{
 const {context}=fixture();context.csfRows=[{id:'GV-OC-01',function:'GOVERN (GV): Description',subcategory:'GV.OC-01: Mission'}];
 const linked=vm.runInContext("gapLinkedDetails('csf','GV-OC-01',{domain:'Manual',sub:'Wrong'})",context);
 assert.equal(linked.domain,'GOVERN (GV)');assert.equal(linked.sub,'GV.OC-01');
 assert.match(vm.runInContext("gapDetailInput('domain',{domain:'GOVERN (GV)'},'csf')",context),/readonly/);
 assert.match(vm.runInContext("gapDetailInput('yearOfInitiative',{yearOfInitiative:'2027'},'csf')",context),/type="number" min="1000" max="9999" step="1"/);
 const quarter=vm.runInContext("gapDetailInput('quarter',{quarter:'Q3'},'csf')",context);
 assert.match(quarter,/<select/);assert.match(quarter,/<option value="Q3" selected>/);assert.doesNotMatch(quarter,/Q5/);
});
test('saved gap details keep short fields compact and allocate space for long content',()=>{
 const {context}=fixture();
 const html=vm.runInContext("gapDetailsHtml({framework:'privacy',controlCode:'ID-P1',details:{quarter:'Q1',yearOfInitiative:'2027',recommendation:'a'.repeat(81),initiative:'Line 1\\nLine 2',pic:'<Team>'}})",context);
 assert.match(html,/<dl class="gap-detail-list">/);
 assert.match(html,/<div class="gap-detail-item"><dt>Kuartal<\/dt><dd[^>]*>Q1<\/dd>/);
 assert.match(html,/<div class="gap-detail-item gap-detail-wide"><dt>Recommendation/);
 assert.match(html,/<div class="gap-detail-item gap-detail-wide"><dt>Initiative/);
 assert.ok(html.includes('&lt;Team&gt;'));assert.ok(!html.includes('<Team>'));
});


test('editing shows only the selected form without other gap details or navigation',()=>{
 const {context}=fixture();const content={},message={};
 context.content=content;context.message=message;
 vm.runInContext("$=id=>id==='gapDialogContent'?content:message;canPerform=()=>true;gapRows=()=>[{id:'selected',framework:'privacy',controlCode:'ID-P1',description:'Selected finding',details:{},evidence:[]},{id:'other',framework:'privacy',controlCode:'ID-P1',description:'Other finding',details:{},evidence:[]}];gapLinkedDetails=()=>({});renderGapDraftEvidence=()=>{};populateGapEvidence=async()=>{};updateGapNumberPreview=()=>{};gapContext={frameworks:['privacy'],code:'ID-P1',filter:'all',editing:'selected',editOnly:true};",context);
 const form={addEventListener(){}};context.form=form;
 vm.runInContext("$=id=>id==='gapDialogContent'?content:id==='assessmentGapForm'?form:message;",context);
 // Restore the actual renderer replaced by the navigation fixture.
 const source=gapSource;
 const render=source.slice(source.indexOf('function renderGapDialog()'),source.indexOf('function renderGapDraftEvidence()'));
 vm.runInContext(render+';renderGapDialog()',context);
 assert.match(content.innerHTML,/Selected finding/);
 assert.doesNotMatch(content.innerHTML,/Other finding|class="gap-records"|data-gap-page=/);
 let closed=false;context.dialog.close=()=>{closed=true;};
 vm.runInContext('finishAssessmentGapEdit()',context);assert.equal(closed,true);
});
