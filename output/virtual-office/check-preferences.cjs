const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');const {spawn}=require('node:child_process');const express=require('express');const app=express();app.use(express.static(path.resolve('frontend/public')));const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const debugPort=10100+Math.floor(Math.random()*100),profile=path.join(os.tmpdir(),'nist-office-browser-'+Date.now());
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-unsafe-swiftshader','--use-angle=swiftshader','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
try{for(let i=0;i<80;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}if(!ws)throw Error('Chrome did not start');await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),errors=[];ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const waitFor=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Browser wait failed: '+expression);};

await call('Runtime.enable');await call('Page.enable');
for(const page of ['login','landing'])for(const width of [1280,1024,768,390,320]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${page}.html`});
 await waitFor("document.querySelector('[data-language-select]') && window.NistTheme");
 const metrics=await evaluate(`(()=>{const l=document.querySelector('[data-language-select]').getBoundingClientRect(),b=document.querySelector('[data-theme-toggle]').getBoundingClientRect();return {right:b.left>=l.right-1,aligned:Math.abs((l.top+l.height/2)-(b.top+b.height/2))<2,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 assert.ok(metrics.right&&metrics.aligned,JSON.stringify({page,width,...metrics}));assert.equal(metrics.overflow,false,JSON.stringify({page,width,...metrics}));
 await evaluate("document.querySelector('[data-theme-toggle]').click()");
 assert.ok(await evaluate("document.documentElement.dataset.theme==='dark'||document.documentElement.dataset.theme==='light'"));
 if(page==='landing')assert.equal(await evaluate("document.querySelector('.header-preferences .language-switcher span')===null"),true);
 if(width===1280){const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`output/virtual-office/${page}-preferences.png`,Buffer.from(shot.data,'base64'));}
 console.log('PASS',page,width);
}
assert.deepEqual(errors,[]);
}finally{ws?.close();chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
