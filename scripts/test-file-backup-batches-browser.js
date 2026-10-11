// Verify the built File Backup view using isolated API fixtures; no application files are restored.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-file-backup-workspace-'+Date.now());
 try{
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user,'Existing administrator available');
 const warm=[];try{for(let i=0;i<10;i++)warm.push(await pool.connect());}finally{warm.forEach(client=>client.release());}
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

 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
 const original=window.fetch.bind(window),queue=[];let active=0;
 function pump(){while(active<3&&queue.length){const job=queue.shift();active++;original(job.input,job.options).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
 window.fetch=(input,options={})=>{
 const url=typeof input==='string'?input:input.url;
 if(url.startsWith('/api/file-backups')){
 let body=[];
 if(url.endsWith('/folders'))body=['Policy','Knowledge Notes'];
 else if(url.endsWith('/restore-batch')){window.__backupUploads=options.body.getAll('backups').map(file=>file.name);body={fileCount:2,partCount:2};}
 else if(options.method==='POST')body={fileCount:9,parts:[{},{}],missingFiles:[{path:'Policy/missing.pdf'}]};
 else body=[{fileName:'nist-basis-files-20261011T012902Z-00000000-0000-0000-0000-000000000000-part-0001-of-0002.zip',size:512,createdAt:'2026-10-11T01:29:02Z',part:1,partCount:2}];
 return Promise.resolve(new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}}));
 }
 return new Promise((resolve,reject)=>{queue.push({input,options,resolve,reject});pump();});
 };window.confirm=()=>true;
 }`});
 await call('Page.navigate',{url:base+'/app'});
 await wait("!!document.querySelector('#csfTableBody [data-assessment-gaps]')");
 await evaluate("document.querySelector('[data-view=file-backups]').click()");
 await wait("document.querySelector('#fileBackupBody').textContent.includes('1 / 2')");
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreInput').multiple"),true);
 await evaluate(`{
 const input=document.querySelector('#fileBackupRestoreInput');
 const files=[new File(['one'],'part-1.zip'),new File(['two'],'part-2.zip')];
 files.forEach(file=>Object.defineProperty(file,'size',{value:300*1024*1024}));
 Object.defineProperty(input,'files',{configurable:true,value:files});input.dispatchEvent(new Event('change',{bubbles:true}));
 }`);
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreButton').disabled"),false);
 assert.ok((await evaluate("document.querySelector('#fileBackupRestoreFileName').textContent")).includes('600'));
 await evaluate("document.querySelector('#fileBackupRestoreButton').click()");
 await wait("window.__backupUploads?.length===2");
 assert.deepEqual(await evaluate("window.__backupUploads"),['part-1.zip','part-2.zip']);
 await wait("document.querySelector('#fileBackupRestoreButton').disabled && !document.querySelector('#fileBackupCreateButton').disabled");
 await evaluate("document.querySelector('#fileBackupCreateButton').click()");
 await wait("document.querySelector('#fileBackupStatus').textContent.includes('9 file')");
 assert.ok((await evaluate("document.querySelector('#fileBackupStatus').textContent")).includes('2'));
 assert.ok((await evaluate("document.querySelector('#fileBackupStatus').textContent")).includes('Policy/missing.pdf'));
 assert.equal(await evaluate("document.querySelector('#fileBackupFolder').options.length"),3);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS file backup UI: multipart selection >500 MiB total, restore multipart body, batch labels, create status, folder selection');
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-file-backup-workspace-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
