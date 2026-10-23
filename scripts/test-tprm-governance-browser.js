// Source UI fixture only; no accounts, operational database, uploads or email.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express');
const {spawn}=require('node:child_process'),{Cdp}=require('./test-threat-modelling-browser');const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let server,chrome,client;const profile=await fs.mkdtemp(path.join(os.tmpdir(),'nist-tprm-governance-'));try{
 const component=await fs.readFile('frontend/client/src/workspace/components/TprmRegisterView.vue','utf8');
 const template=component.match(/<template>([\s\S]*)<\/template>/)[1].replace(' v-pre','');
 const lifecycle=await fs.readFile('frontend/client/src/workspace/features/tprm/lifecycle.js','utf8');
 const vendor=await fs.readFile('frontend/client/src/workspace/features/tprm/vendor-register.js','utf8');
 const tabs=vendor.slice(vendor.indexOf("document.querySelectorAll('[data-tprm-register-tab]')"),vendor.indexOf(" $('tprmDashboardOpenRegister')"));
 const app=express();
 app.get('/',(req,res)=>res.send(`<!doctype html><body><style>dialog{max-width:95vw;max-height:90vh;overflow:auto}label{display:block;margin:8px}button{margin:4px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc}</style>${template}<script>
 const $=id=>document.getElementById(id);const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let currentUserRole='admin',workspaceUserReady=Promise.resolve({username:'admin',role:'admin'});const canPerform=()=>currentUserRole!=='viewer';const guardFormSubmission=fn=>fn;const riskDate=value=>value||'';const apiFileOpenUrl=value=>'/fixture/'+encodeURIComponent(value);
 const fixture={stage:'Draft',relationshipStatus:'Pending',summary:{tier:'Tier 1 (Critical)',level:'High Risk',residual:75,inherent:75,readiness:{answered:1,total:1,documents:1}},governance:{policy:{days:90},reminders:[]},alerts:[],profile:{owner:'Owner'},conditions:[],history:[],questionnaireHistory:[],dependencies:[],options:{users:[{username:'requester',name:'Pengusul',role:'user',requester:true},{username:'reviewer',name:'Reviewer',role:'editor',requester:true,reviewer:true},{username:'approver',name:'Approver',role:'approver',requester:true,reviewer:true,approver:true}],acceptances:[{id:'1',title:'Vendor hosting',expiresAt:'2099-01-01'}]}};
 let tprmRows=[{id:1,thirdParty:'Vendor Fixture',serviceDependency:'Hosting',relationshipStatus:'Pending',workflow:fixture,governance:fixture.governance}];
 const questionnaire={responses:{vendorDocuments:[{path:'fixture/contract.pdf',name:'Signed contract'}]}};const questionnaireForTprm=()=>questionnaire;
 const loadQuestionnaires=async()=>{};const loadTprmRows=async()=>{};
 window.fetch=async(url,options)=>{if(options?.method==='POST'){window.lastBody=JSON.parse(options.body);if(lastBody.action==='assign')fixture.assignments=lastBody.assignments;}return {ok:true,json:async()=>structuredClone(fixture)};};
 window.useActor=(username,role)=>{currentUserRole=role;workspaceUserReady=Promise.resolve({username,role});};
 ${lifecycle}
 ${tabs}
 renderTprmGovernanceMatrix();window.ready=true;
 </script></body>`));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const port=12000+Math.floor(Math.random()*500);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await delay(100);}assert.ok(target);client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');await client.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await client.wait('window.ready===true');
 await client.evaluate("document.querySelector('[data-tprm-register-tab=governance]').click()");assert.equal(await client.evaluate("document.getElementById('tprmGovernancePanel').hidden"),false);
 await client.evaluate("document.querySelector('[data-tprm-assignments]').click()");await client.wait("document.getElementById('tprmWorkflowModal').open&&!!document.getElementById('twAssignreviewer')");
 await client.evaluate("document.getElementById('twAssignrequester').value='requester';document.getElementById('twAssignreviewer').value='reviewer';document.getElementById('twAssignapprover').value='approver';document.querySelector('#tprmWorkflowFields button[value=assign]').click()");await client.wait("document.getElementById('tprmWorkflowStatus').textContent==='Saved'");assert.deepEqual(await client.evaluate('lastBody.assignments'),{requester:'requester',reviewer:'reviewer',approver:'approver'});
 await client.evaluate("document.querySelector('[data-tw-tab=assessment]').click();document.querySelector('[data-tw-add-dependency]').click()");assert.equal(await client.evaluate("document.querySelectorAll('[data-tw-dependency]').length"),1);
 await client.evaluate("document.querySelector('[data-tw-tab=approval]').click()");assert.equal(await client.evaluate("document.getElementById('twRiskAcceptanceId').options.length"),2);
 await client.evaluate("document.querySelector('[data-tw-tab=monitoring]').click()");for(const id of ['twContractEvidence','twContractSigned','twContractExpiry','twContractSla','twIncidentHours','twRto','twRpo','twReviewTrigger'])assert.equal(await client.evaluate(`!!document.getElementById('${id}')`),true,id);
 await client.evaluate("document.getElementById('tprmWorkflowModal').close();useActor('viewer','viewer');openTprmLifecycle(tprmRows[0],'assignments')");await client.wait("document.getElementById('twAssignreviewer')?.disabled===true");assert.equal(await client.evaluate("!!document.querySelector('#tprmWorkflowFields button[value=assign]')"),false);
 await client.evaluate("document.getElementById('tprmWorkflowModal').close();fixture.stage='Under review';useActor('outsider','editor');openTprmLifecycle(tprmRows[0],'review')");await client.wait("document.getElementById('tprmWorkflowModal').open");assert.equal(await client.evaluate("!!document.querySelector('#tprmWorkflowFields button[value=review]')"),false);
 await client.evaluate("document.getElementById('tprmWorkflowModal').close();useActor('reviewer','editor');openTprmLifecycle(tprmRows[0],'review')");await client.wait("!!document.querySelector('#tprmWorkflowFields button[value=review]')");
 assert.deepEqual(client.errors,[]);console.log('PASS: real TPRM source tabs, assignment form payload, read-only access, actor-specific buttons, dependencies, risk acceptance selection and contract fields.');
 }finally{client?.socket.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-tprm-governance-'))try{await fs.rm(resolved,{recursive:true,force:true});}catch{}}})().catch(error=>{console.error(error);process.exitCode=1;});
