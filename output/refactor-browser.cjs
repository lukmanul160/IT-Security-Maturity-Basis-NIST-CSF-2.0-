// Verify monitoring in the built workspace using real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-theme-browser-'+Date.now());
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
 await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:"const loaderObserver=new MutationObserver(()=>{if(document.querySelector('#governanceLoading img[src*=loading-logo]')){window.loadingLogoPresent=true;loaderObserver.disconnect();}});loaderObserver.observe(document,{childList:true,subtree:true});"});await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'&&!!document.querySelector('[data-theme-toggle]')");
 await wait("!document.getElementById('governanceLoading')");assert.equal(await evaluate('loadingLogoPresent'),true);
 assert.equal(await evaluate("document.documentElement.dataset.theme"),'light');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.header-owl-awake')).display"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.header-owl-body')).animationName"),'header-owl-breathe');
 await evaluate("document.querySelector('[data-theme-toggle]').click()");await wait("document.documentElement.dataset.theme==='dark'");assert.equal(await evaluate("localStorage.getItem('nist-basis-theme')"),'dark');assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"),'rgb(16, 24, 39)');assert.equal(await evaluate("getComputedStyle(document.querySelector('.sidebar')).backgroundColor"),'rgb(26, 38, 56)');


 await evaluate("{const fixture=document.createElement('div');fixture.id='auditRefactorFixture';fixture.innerHTML='<table class=excel-table><tbody><tr><td><details open data-aft-details=fixture><table class=excel-table><tbody><tr><td id=auditNestedCell>Finding</td></tr><tr><td id=auditNestedEven>Finding 2</td></tr></tbody></table></details></td></tr></tbody></table>';document.querySelector('.main-content').prepend(fixture);}");
 assert.equal(await evaluate("getComputedStyle(document.getElementById('auditNestedCell')).backgroundColor"),'rgb(26, 38, 56)');
 assert.equal(await evaluate("getComputedStyle(document.getElementById('auditNestedEven')).backgroundColor"),'rgb(29, 44, 65)');
 const position=await evaluate("(()=>{const r=document.getElementById('auditNestedCell').getBoundingClientRect();return {x:r.x+10,y:r.y+10};})()");
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...position});
 assert.equal(await evaluate("getComputedStyle(document.getElementById('auditNestedCell')).backgroundColor"),'rgb(36, 52, 75)');
 assert.deepEqual(errors,[]);
 console.log('PASS: built workspace initializes without browser exceptions; nested audit cells remain dark before and during hover.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-theme-browser-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
