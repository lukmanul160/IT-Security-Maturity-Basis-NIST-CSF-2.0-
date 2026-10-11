// Verify monitoring in the built workspace using real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-theme-browser-'+Date.now());
 try{
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user,'Existing administrator available');
 const warmed=await Promise.all(Array.from({length:8},()=>pool.connect()));warmed.forEach(c=>c.release());
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
 await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:"const loaderObserver=new MutationObserver(()=>{if(document.querySelector('#governanceLoading img[src*=loading-logo]')){window.loadingLogoPresent=true;loaderObserver.disconnect();}});loaderObserver.observe(document,{childList:true,subtree:true});"});await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('nist-maturity-ui',JSON.stringify({view:'knowledge-notes'}));(()=>{const native=window.fetch.bind(window);const queue=[];let active=0;function next(){while(active<3&&queue.length){const job=queue.shift();active++;native(...job.args).then(job.resolve,job.reject).finally(()=>{active--;next();});}}window.fetch=(...args)=>new Promise((resolve,reject)=>{queue.push({args,resolve,reject});next();});})()"});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'&&!!document.querySelector('[data-theme-toggle]')");
 await wait("!document.getElementById('governanceLoading')");



 for(const prefix of ['policySmtp','aftReminder']){
  await evaluate("document.getElementById('"+prefix+"Preset30').click()");
  assert.equal(await evaluate("document.getElementById('"+prefix+"Days').value"),'30');
  assert.equal(await evaluate("document.getElementById('"+prefix+"RepeatEvery').value"),'5');
  assert.ok(await evaluate("document.getElementById('"+prefix+"SchedulePreview').textContent.includes('H-30, H-25, H-20, H-15, H-10, H-5, H')"));
 }
 await evaluate("document.querySelector('[data-view=asset-register]').click()");
 await wait("document.getElementById('assetManagementView').classList.contains('active-view')");
 await wait("Array.from(document.querySelectorAll('#assetManagementView [role=tablist] button')).some(b=>b.textContent.includes('SMTP')&&!b.disabled)");
 await evaluate("Array.from(document.querySelectorAll('#assetManagementView [role=tablist] button')).find(b=>b.textContent.includes('SMTP')).click()");
 await wait("Array.from(document.querySelectorAll('#assetManagementView button')).some(b=>b.textContent.trim()==='Ubah pengaturan'&&!b.disabled)");
 await evaluate("Array.from(document.querySelectorAll('#assetManagementView button')).find(b=>b.textContent.trim()==='Ubah pengaturan').click()");
 await wait("!!document.querySelector('#assetManagementView dialog[open] form')");
 await evaluate("Array.from(document.querySelectorAll('#assetManagementView dialog button')).find(b=>b.textContent.includes('H-30')).click()");
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#assetManagementView dialog input[type=number]')).map(e=>e.value)"),['30','5','7']);
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#assetManagementView dialog input[type=checkbox]')).map(e=>e.checked)"),[false,true,false]);
 await evaluate("Array.from(document.querySelectorAll('#assetManagementView dialog button')).find(b=>b.textContent.trim()==='Batal').click()");
 assert.deepEqual(errors,[]);console.log('PASS: configurable H-30 / 5-day reminder presets and schedule previews in Policy, Audit and Assets. No SMTP settings saved or emails sent.');auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-theme-browser-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
