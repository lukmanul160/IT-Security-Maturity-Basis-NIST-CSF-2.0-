// Verify public pages and workspace responsiveness with real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-responsive-browser-'+Date.now());
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

 const report=[];
 for(const page of ['/app','/login','/']){
 if(page==='/app')await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 if(page==='/login')await call('Network.deleteCookies',{name:auth.sessionCookie,url:base});
 await call('Page.navigate',{url:base+page});await delay(1800);
 for(const theme of ['light','dark']){await evaluate("NistTheme.set('"+theme+"')");
 for(const width of [320,390,768,1024,1440]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(200);
 report.push(await evaluate(`(()=>{const w=innerWidth;return {page:location.pathname,width:w,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.checkVisibility()&&getComputedStyle(e).position!=='fixed').map(e=>({e,r:e.getBoundingClientRect()})).filter(({e,r})=>r.right>w+2||r.left< -2).slice(0,15).map(({e,r})=>({tag:e.tagName,cls:e.className,x:Math.round(r.x),right:Math.round(r.right)}))}})()`));
 }
 }
 if(page==='/app'){
 const views=await evaluate("[...new Set([...document.querySelectorAll('.sidebar [data-view]')].filter(b=>!b.hidden&&!b.disabled).map(b=>b.dataset.view))]");
 for(const view of views){
 await evaluate("document.querySelector('[data-view="+view+"]').click()");await delay(800);
 for(const width of [320,390,768,1440]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(150);
 const r=await evaluate("({page:location.pathname+' / "+view+"',width:innerWidth,scroll:document.documentElement.scrollWidth})");report.push(r);
 }
 }
 await evaluate("document.querySelector('[data-view=personnel-certification]').click();document.querySelector('[data-personnel-tab=organization]').click()");await wait("!!document.querySelector('.organization-scroll .organization-person')");
 for(const theme of ['light','dark']){await evaluate("NistTheme.set('"+theme+"')");for(const width of [320,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(150);assert.ok(await evaluate("(()=>{const e=document.querySelector('.organization-scroll');e.scrollLeft=e.scrollWidth;e.scrollTop=e.scrollHeight;return e.scrollWidth>e.clientWidth&&e.scrollLeft>0&&e.clientHeight<=innerHeight*.7+1&&document.documentElement.scrollWidth<=innerWidth+1;})()"),'Organization scroll stays within viewport: '+theme+' '+width);}}
 await evaluate("document.querySelector('[data-view=asset-register]').click()");await wait("!!document.querySelector('#assetManagementView .asset-toolbar .button-accent')&&!document.querySelector('#assetManagementView .asset-toolbar .button-accent').disabled");await evaluate("document.querySelector('#assetManagementView .asset-toolbar .button-accent').click()");await wait("!!document.querySelector('#assetManagementView dialog[open]')");
 for(const width of [320,390,768]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(150);assert.ok(await evaluate("(()=>{const r=document.querySelector('#assetManagementView dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight;})()"),'Asset modal fits '+width);}
 await evaluate("document.querySelector('#assetManagementView dialog .section-heading button').click()");
 }
 }
 fs.writeFileSync('output/responsive-probe.json',JSON.stringify(report,null,2));for(const r of report){assert.ok(r.scroll<=r.width+1,JSON.stringify(r));assert.ok([320,390,768,1024,1440].includes(r.width),'Viewport must retain requested device width: '+JSON.stringify(r));}assert.deepEqual(errors,[]);console.log('PASS: light/dark landing, login and dashboard at 320?1440px; asset lists, racks, modelling, Knowledge, risk, TPRM and files fit mobile/tablet; asset modal fits viewport; no browser exceptions.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-responsive-browser-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
