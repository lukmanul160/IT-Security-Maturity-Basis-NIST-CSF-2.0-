// Exercise the built workspace and real read-only APIs; no asset/rack records are created.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-cia-dark-'+Date.now());
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


 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base+'/app'});await wait("!!document.querySelector('#tprmAssessmentModal')");
 await wait("document.querySelector('#sidebarGreeting')?.textContent.startsWith('Halo ')");
 await evaluate("document.querySelector('[data-view=\"tprm-register\"]').click();document.documentElement.dataset.theme='dark';const modal=document.getElementById('tprmAssessmentModal');modal.querySelector('.eyebrow').textContent='CIA VENDOR SERVICE ASSESSMENT';modal.querySelector('h3').textContent='Vendor service assessment';modal.showModal();");
 await delay(200);
 const colors=await evaluate("(()=>{const modal=document.getElementById('tprmAssessmentModal');return {panels:[...modal.querySelectorAll('.cia-assessment-grid section')].map(node=>getComputedStyle(node).backgroundColor),fields:[...modal.querySelectorAll('input')].filter(node=>node.type!=='hidden').map(node=>getComputedStyle(node).backgroundColor),readonly:getComputedStyle(document.getElementById('tprmAssessmentConfidentiality')).backgroundColor,legend:getComputedStyle(modal.querySelector('legend')).color};})()");
 assert.deepEqual(colors.panels,['rgb(32, 47, 69)','rgb(32, 47, 69)','rgb(32, 47, 69)']);assert.ok(colors.fields.every(color=>color!=='rgb(255, 255, 255)'));assert.equal(colors.readonly,'rgb(38, 62, 96)');
 const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/tprm-cia-dark-preview.png',Buffer.from(shot.data,'base64'));
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await delay(100);const size=await evaluate("(()=>{const modal=document.getElementById('tprmAssessmentModal');return {width:modal.clientWidth,scroll:modal.scrollWidth};})()");assert.ok(size.scroll<=size.width+2);
 await evaluate("document.documentElement.dataset.theme='light'");assert.equal(await evaluate("getComputedStyle(document.querySelector('#tprmAssessmentModal .cia-assessment-grid section')).backgroundColor"),'rgb(248, 251, 255)');
 console.log('PASS: CIA panels, inputs, read-only summaries and legend follow dark mode; mobile layout and light theme preserved');auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server)await new Promise(r=>server.close(r));await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-cia-dark-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
