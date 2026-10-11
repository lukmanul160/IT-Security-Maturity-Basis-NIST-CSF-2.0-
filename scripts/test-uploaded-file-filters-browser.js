// Verify per-control gaps in the built workspace; gap API mutations use isolated in-memory fixtures.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-file-filter-'+Date.now());
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

 const fixtures=Array.from({length:25},(_,i)=>({path:`upload/Govern/Practice/test/file-${i}.pdf`,name:`file-${i}.pdf`,source:'Govern',module:'Govern',type:'application/pdf'}));
 fixtures.push({path:'upload/ISO 27001/Policy/test/evidence.docx',name:'evidence.docx',source:'ISO 27001',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 fixtures.push({path:'upload/Asset Management/assets/test/photo.png',name:'photo.png',source:'Asset Register',type:'image/png'});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{const nativeFetch=window.fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('/api/files?')?Promise.resolve(new Response(JSON.stringify(${JSON.stringify(fixtures)}),{headers:{'Content-Type':'application/json'}})):nativeFetch(url,options);}`});
 await call('Page.navigate',{url:base+'/app'});
 await wait("document.querySelector('#uploadedFileSourceFilter')?.options.length===4");
 await evaluate("document.querySelector('[data-view=files]').click()");
 assert.equal(await evaluate("document.querySelector('#uploadedFileCount').textContent"),'27 dari 27 file');
 assert.equal(await evaluate("document.querySelectorAll('#uploadedFilesBody tr').length"),20);
 const change=async(id,value)=>evaluate(`{const element=document.getElementById(${JSON.stringify(id)});element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('change',{bubbles:true}));}`);
 await change('uploadedFileSourceFilter','Asset Register');
 assert.equal(await evaluate("document.querySelectorAll('#uploadedFilesBody tr').length"),1);
 assert.equal(await evaluate("document.querySelector('#uploadedFilesBody .uploaded-file-name').textContent"),'photo.png');
 await change('uploadedFileFormatFilter','PDF');
 assert.equal(await evaluate("!!document.querySelector('#uploadedFilesBody .empty-files')"),true);
 await evaluate("document.querySelector('#uploadedFileResetFilters').click()");
 await change('uploadedFileKindFilter','practice');
 assert.equal(await evaluate("document.querySelector('#uploadedFileCount').textContent"),'25 dari 27 file');
 await change('uploadedFileSourceFilter','CSF 2.0 / Govern');
 await evaluate("document.querySelector('#uploadedFilesPagination [data-page=\"2\"]').click()");
 assert.equal(await evaluate("document.querySelectorAll('#uploadedFilesBody tr').length"),5);
 await change('uploadedFileFormatFilter','DOCX');
 assert.equal(await evaluate("!!document.querySelector('#uploadedFilesBody .empty-files')"),true);
 await evaluate("document.querySelector('#uploadedFileResetFilters').click()");
 await change('uploadedFileFormatFilter','DOCX');
 assert.equal(await evaluate("document.querySelector('#uploadedFilesBody .framework-badge').textContent"),'ISO 27001:2022');
 for(const width of [1440,768,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await delay(200);
   assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,'overflow '+width);
   for(const theme of ['dark','light']){await evaluate(`NistTheme.set('${theme}')`);await delay(100);}
 }
 assert.deepEqual(errors,[]);console.log('PASS: dynamic source/type/format options, combined filters, counts, pagination, reset and responsive dark/light. No business records changed.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-file-filter-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
