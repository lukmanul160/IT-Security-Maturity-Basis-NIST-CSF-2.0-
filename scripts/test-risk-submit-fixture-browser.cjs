const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {Cdp}=require('./test-threat-modelling-browser');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 const component=await fs.readFile('frontend/client/src/workspace/components/RiskManagementView.vue','utf8');
 const markup=component.match(/<template>([\s\S]*?)<\/template>/)[1];
 const workflow=require('./lib/runtime-manifest.cjs').readSourceGroup('risk-workflow');
 const style=await fs.readFile('frontend/client/src/styles/risk-dashboard.css','utf8');
 const risk={riskId:'fixture',riskOwner:'Owner',riskCategory:'Technical',effectedAsset:'Server',identificationRisk:'Outage',riskCause:'Bug',riskControl:'Backup',riskAnalysis:'Business downtime',likelihood:3,impact:4,treatmentAction:'Mitigation',ownerOfAction:'Team',deadline:'2099-12-31',riskTreatmentDescription:'Patch'};
 const ready={stage:'Assessed',version:3,history:[],threat:'Outage',vulnerability:'Bug',likelihoodRationale:'Exposure',impactRationale:'Downtime',currentLikelihood:3,currentImpact:4,targetLikelihood:1,targetImpact:2,toleranceScore:4,toleranceRationale:'Policy',approver:'chief',reviewer:'reviewer',progress:0};
 const setup=`const $=id=>document.getElementById(id);const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const canPerform=()=>true;const riskManagementRows=[${JSON.stringify(risk)}],riskRegisterColumns=[];const loadRiskManagement=async()=>{};const ready=${JSON.stringify(ready)};window.requests=[];window.failRequest=false;window.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});await new Promise(r=>setTimeout(r,200));return {ok:!window.failRequest,json:async()=>window.failRequest?{error:'Approver tidak valid.'}:{...ready,stage:'Pending Approval',version:4}};};`;
 const init="rwRiskId='fixture';rwIdentity={username:'author',role:'admin'};$('rwApprover').innerHTML='<option>chief</option>';$('rwReviewer').innerHTML='<option>reviewer</option>';rwRender(ready);$('riskWorkflowModal').showModal();";
 const html=`<!doctype html><html><head><style>${style}dialog{width:700px;max-height:85vh;overflow:auto}.rw-needs-input{border-color:orange}</style></head><body class="workspace-ui">${markup}<script>${setup}\n${workflow}\n${init}</script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=path.join(os.tmpdir(),'nist-submit-fixture-'+Date.now()),debugPort=9900+Math.floor(Math.random()*100);let chrome,cdp;
 try{
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){try{target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(100);}}
  assert.ok(target);cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();await cdp.send('Runtime.enable');await cdp.send('Page.enable');
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await cdp.wait('document.querySelector("[data-rw-action=submit]")');
  await cdp.evaluate("document.querySelector('[data-rw-action=submit]').click()");await cdp.wait("document.querySelector('#rwActionStatus').textContent.includes('Alasan keputusan')");assert.equal(await cdp.evaluate('requests.length'),0);
  await cdp.evaluate("$('rwReason').value='Reviewed';document.querySelector('[data-rw-action=submit]').click()");await cdp.wait("$('rwActionStatus').dataset.tone==='pending'");await cdp.wait("$('rwStage').textContent.includes('Pending Approval')");
  assert.equal(await cdp.evaluate("requests[0].body.action"),'submit');assert.equal(await cdp.evaluate("$('rwActionStatus').dataset.tone"),'success');
  await cdp.evaluate("rwRender(ready);$('rwReason').value='Reviewed';$('rwThreat').value='Changed';document.querySelector('[data-rw-action=submit]').click()");assert.equal(await cdp.evaluate('requests.length'),1);assert.match(await cdp.evaluate("$('rwActionStatus').textContent"),/belum disimpan/);
  await cdp.evaluate("rwRender(ready);$('rwReason').value='Reviewed';window.failRequest=true;document.querySelector('[data-rw-action=submit]').click()");await cdp.wait("$('rwActionStatus').textContent.includes('Approver tidak valid')");assert.equal(await cdp.evaluate("$('rwActionStatus').dataset.tone"),'error');assert.equal(await cdp.evaluate("$('rwActionStatus').hidden"),false);
  assert.deepEqual(cdp.errors,[]);console.log('PASS: real Chrome clicks cover missing reason, pending/success, unsaved edits, and visible API rejection; fixture transport only, no database.');
 }finally{cdp?.socket.close();chrome?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-submit-fixture-')){await delay(500);await fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});}}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
