// Exercise the built workspace and real read-only APIs; no asset/rack records are created.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-rack-workspace-'+Date.now());
 try{
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user,'Existing administrator available');
 const auth=require('../src/config/auth'),token=auth.createSession({username:user.username,role:'admin'});
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const port=9800+Math.floor(Math.random()*100);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<60;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
 assert.ok(ws,'Chrome available');await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map(),errors=[];
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){waiting.get(m.id)(m);waiting.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{waiting.set(++id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+'; errors: '+JSON.stringify(errors)+'; asset status: '+await evaluate("document.querySelector('#assetManagementView').innerText.slice(0,1200)"));};
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('nist-maturity-ui',JSON.stringify({view:'server-racks',function:'GV'}));"});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'");await wait("document.querySelector('#assetManagementView.active-view .page-heading h2')?.textContent==='Rak Server'");
 await wait("!document.querySelector('#assetManagementView [role=status]').textContent.includes('Memuat')");
 const status=await evaluate("document.querySelector('#assetManagementView [role=status]').textContent");assert.equal(status,'');
 const result=await evaluate("(async()=>{const r=await fetch('/api/asset-management/racks');const rows=await r.json();const photos=await fetch('/api/asset-management/photos');return {rackCount:rows.length,frames:document.querySelectorAll('#assetManagementView .rack-frame').length,photos:photos.status,hasToolbar:!!document.querySelector('#assetManagementView .toolbar .button-accent')};})()");
 assert.equal(result.frames,result.rackCount?2:0);assert.equal(result.photos,200);assert.equal(result.hasToolbar,true);
 for(const [key,title] of [['asset-register','Register Aset'],['server-racks','Rak Server'],['asset-modelling','Pemodelan Register Aset']]){await evaluate(`document.querySelector('[data-view="${key}"]').click()`);await wait(`document.querySelector('#assetManagementView.active-view .page-heading h2')?.textContent===${JSON.stringify(title)}`);await wait("!document.querySelector('#assetManagementView [role=status]').textContent.includes('Memuat')");}
 assert.equal(await evaluate("fetch('/api/asset-management/diagram').then(r=>r.status)"),200);assert.ok(await evaluate("!!document.querySelector('#assetManagementView .asset-modelling-workbench svg')"));
 await evaluate("document.querySelector('[data-view=\"asset-register\"]').click()");await wait("!document.querySelector('#assetManagementView [role=status]').textContent.includes('Memuat')");await wait("Array.from(document.querySelectorAll('#assetManagementView .asset-table th')).some(e=>['related risk','risiko terkait'].includes(e.textContent.trim().toLowerCase()))");assert.equal(await evaluate("fetch('/api/asset-management/risk-catalog').then(r=>r.status)"),200);await evaluate("Array.from(document.querySelectorAll('#assetManagementView [role=tab]')).find(b=>b.textContent.includes('SMTP')).click()");await wait("!!document.querySelector('#assetManagementView .asset-email-preview')");assert.equal(await evaluate("fetch('/api/asset-management/reminder-settings').then(r=>r.status)"),200);
 await evaluate("document.querySelector('[data-view=\"server-racks\"]').click()");await wait("document.querySelector('#assetManagementView.active-view .page-heading h2')?.textContent==='Rak Server'");await delay(400);const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/asset-rack-workspace-check.png',Buffer.from(shot.data,'base64'));

 await evaluate(`document.querySelector('[data-view="asset-dashboard"]').click()`);
 await wait(`document.querySelector('#assetDashboardPanel') && !document.querySelector('#assetManagementView [role=status]').textContent.includes('Memuat')`);
 assert.equal(await evaluate(`document.querySelectorAll('#assetDashboardPanel table').length`),0);
 await wait(`document.querySelector('#assetDashboardPanel .rd-kpi strong')?.textContent!=='Belum tersedia'`);
 const assetCount=await evaluate(`document.querySelector('#assetDashboardPanel .rd-kpi strong').textContent`);
 assert.equal(Number(assetCount),await evaluate(`fetch('/api/asset-management/assets').then(r=>r.json()).then(r=>r.length)`));
 await evaluate(`document.querySelector('#assetDashboardPanel .rd-kpi').click()`);
 await wait(`document.querySelector('#assetManagementView .page-heading h2')?.textContent==='Register Aset'`);
 await evaluate(`document.querySelector('[data-view="tprm-register"]').click()`);
 await wait(`document.querySelector('#tdStatus')?.textContent.includes('Vendor: tersedia')`);
 assert.equal(await evaluate(`document.querySelectorAll('#tprmDashboardPanel table').length`),0);
 assert.equal(await evaluate(`Number(document.querySelector('#tprmDashboardTotal').textContent)`),await evaluate(`fetch('/api/tprm').then(r=>r.json()).then(r=>r.length)`));
 await evaluate(`document.querySelector('[data-td-kpi="questionnaires"]').click()`);
 await wait(`document.querySelector('#tprmQuestionnaireView').classList.contains('active-view')`);
 assert.equal(await evaluate(`!!document.querySelector('#tdClearQuestions')`),true);
 await evaluate(`document.querySelector('#tdClearQuestions').click()`);
 await evaluate(`document.querySelector('[data-view="tprm-register"]').click()`);
 await wait(`document.querySelector('#tdStatus')?.textContent.includes('Vendor: tersedia')`);
 await evaluate(`document.querySelector('[data-td-kpi="all"]').click()`);
 assert.equal(await evaluate(`document.querySelector('#tprmRegisterPanel').hidden`),false);
 assert.equal(await evaluate(`document.querySelector('#tdListContext').hidden`),false);
 await evaluate(`document.querySelector('#tdClearDrill').click()`);
 assert.equal(await evaluate(`document.querySelector('#tdListContext').hidden`),true);
 for(const width of [1440,768,390]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
 for(const key of ['asset-dashboard','tprm-register']){
 await evaluate(`document.querySelector('[data-view="${key}"]').click()`);
 if(key==='tprm-register')await evaluate(`document.querySelector('[data-tprm-register-tab="dashboard"]').click()`);
 await delay(600);
 if(width===1440){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join('output',key==='asset-dashboard'?'asset-dashboard-preview.png':'tprm-dashboard-preview.png'),Buffer.from(shot.data,'base64'));}
 const dimensions=await evaluate(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})`);
 assert.ok(dimensions.scroll<=dimensions.client+2,`${key}: overflow at ${width}: ${JSON.stringify(dimensions)}`);
 }
 }
 assert.deepEqual(errors,[]);console.log('PASS: asset and TPRM dashboards use actual APIs, drill to existing tables, mobile widths pass, no browser exceptions.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server)await new Promise(r=>server.close(r));await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-rack-workspace-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
