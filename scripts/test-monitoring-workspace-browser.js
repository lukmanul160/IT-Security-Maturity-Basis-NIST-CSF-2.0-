// Verify monitoring in the built workspace using real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-monitor-workspace-'+Date.now());
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
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+'; errors: '+JSON.stringify(errors)+'; asset status: '+await evaluate("location.href+' '+document.querySelector('#monitoringDashboardView')?.innerText.slice(0,1200)"));};
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.pathname==='/login') localStorage.setItem('nist-maturity-ui',JSON.stringify({view:'asset-register',function:'GV'}));"});
 await call('Page.navigate',{url:base+'/login'});
 await wait("!!document.querySelector('#monitoringDashboardView.active-view .monitor-module-grid')");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('nist-maturity-ui')).view"),'monitoring-dashboard');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'");await wait("!!document.querySelector('#monitoringDashboardView.active-view .monitor-module-grid')");
 assert.ok(await evaluate("!!(document.querySelector('[data-view=monitoring-dashboard]').compareDocumentPosition(document.querySelector('#assessmentNavGroup')) & Node.DOCUMENT_POSITION_FOLLOWING)"));
 assert.equal(await evaluate("document.querySelectorAll('.active-view').length"),1);
 const result=await evaluate("(async()=>{const r=await fetch('/api/monitoring-dashboard'),body=await r.json();return {status:r.status,count:body.modules.length,failures:body.modules.filter(m=>m.state!=='ready').map(m=>m.id),cards:document.querySelectorAll('[data-monitor-module]').length};})()");assert.equal(result.status,200);assert.equal(result.count,result.cards);assert.ok(result.count>=20);assert.deepEqual(result.failures,[]);
 await evaluate("document.querySelector('[data-monitor-module=smtp] .monitor-open').click()");await wait("document.querySelector('[data-account-tab=smtp]').getAttribute('aria-selected')==='true'");await evaluate("document.querySelector('[data-view=monitoring-dashboard]').click()");await wait("!!document.querySelector('#monitoringDashboardView.active-view .monitor-module-grid')");
 await evaluate("document.querySelector('[data-view=asset-register]').click()");await wait("!!document.querySelector('#assetManagementView.active-view')");await evaluate("document.querySelector('[data-view=monitoring-dashboard]').click()");await wait("!!document.querySelector('#monitoringDashboardView.active-view .monitor-module-grid')");
 await delay(1500);await call('Page.reload');await delay(500);await wait("!!document.querySelector('#monitoringDashboardView.active-view .monitor-module-grid')");assert.equal(await evaluate("document.querySelectorAll('.active-view').length"),1);
 assert.deepEqual(errors,[]);console.log('PASS: built workspace restores Monitoring Dashboard, sidebar sits above Assessment map, real read-only API data renders all permitted modules, navigation and reload preserve the active view, no browser exceptions.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server)await new Promise(r=>server.close(r));await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-monitor-workspace-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
