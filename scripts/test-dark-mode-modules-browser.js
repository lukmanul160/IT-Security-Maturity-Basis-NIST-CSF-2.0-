// Verify monitoring in the built workspace using real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-dark-modules-'+Date.now());
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
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'&&!!document.querySelector('[data-theme-toggle]')");
 await evaluate("NistTheme.set('dark')");await delay(1500);
 const report=[];
 const scan=async label=>{await delay(700);const light=await evaluate(`(()=>{const root=document.querySelector('.view.active-view');return [...(root?.querySelectorAll('*')||[])].filter(e=>e.checkVisibility()&&!['INPUT','SVG','PATH','CANVAS','IMG'].includes(e.tagName)).filter(e=>{const s=getComputedStyle(e),v=s.backgroundColor.match(/[0-9.]+/g);return v&&v.length>=3&&(!v[3]||+v[3]>.5)&&v.slice(0,3).every(x=>+x>160)}).map(e=>({id:e.id,cls:e.className,tag:e.tagName,bg:getComputedStyle(e).backgroundColor,parent:e.parentElement.className}));})()`);report.push({label,light});};
 const views=await evaluate("[...document.querySelectorAll('.sidebar [data-view]')].filter(b=>!b.hidden&&!b.disabled).map(b=>b.dataset.view)");
 for(const view of [...new Set(views)]){await evaluate("document.querySelector('.sidebar [data-view=\""+view+"\"]').click()");if(view==='csf')await wait("!!document.querySelector('#functionCards .coverage-score')");await scan(view);const tabs=await evaluate("[...document.querySelectorAll('.view.active-view button[aria-controls]')].filter(e=>e.checkVisibility()).map(e=>e.getAttribute('aria-controls'))");for(const id of tabs){await evaluate("document.querySelector('.view.active-view button[aria-controls=\""+id+"\"]').click()");await scan(view+' / '+id);}}
 await evaluate("document.getElementById('accountButton').click()");for(const tab of ['profile','permissions','matrix','users','audit','smtp','storage']){await evaluate("document.querySelector('[data-account-tab="+tab+"]').click()");await scan('account / '+tab);}
 fs.writeFileSync('output/dark-mode-module-audit.json',JSON.stringify(report,null,2));assert.deepEqual(report.filter(r=>r.light.length),[],'All module and tab surfaces follow dark mode');assert.deepEqual(errors,[]);console.log('PASS: '+report.length+' module/tab checks show no light surfaces in dark mode, no browser exceptions.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-dark-modules-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
