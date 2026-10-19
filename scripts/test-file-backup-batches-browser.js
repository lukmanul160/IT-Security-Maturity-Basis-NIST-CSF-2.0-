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
 const fixtureApp=require('express')();
 fixtureApp.post('/api/upload-progress-fixture',(req,res)=>{let total=0;req.on('data',chunk=>{total+=chunk.length;});req.on('end',()=>setTimeout(()=>res.json({receivedBytes:total}),1200));});
 fixtureApp.use(require('../src/app'));server=fixtureApp.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
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
   if(url.endsWith('/inspect'))body={folders:['Archive/2026','Archive','Notes']};
   else if(url.endsWith('/folders'))body=['Policy','Policy/2026','Knowledge Notes'];
   else if(options.method==='POST')body={fileCount:9,parts:[{},{}],missingFiles:[{path:'Policy/missing.pdf'}]};
   else body=[{fileName:'nist-basis-files-20261011T012902Z-00000000-0000-0000-0000-000000000000-part-0001-of-0002.zip',size:512,createdAt:'2026-10-11T01:29:02Z',part:1,partCount:2}];
   return Promise.resolve(new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}}));
  }
  if(url==='/api/backups'){
   if(options.method==='POST')return new Promise(resolve=>{window.__dbBackupDone=()=>resolve(new Response(JSON.stringify({fileName:'nist-basis-20261011T000000Z.dump',size:2048}),{headers:{'Content-Type':'application/json'}}));});
   return Promise.resolve(new Response('[]',{headers:{'Content-Type':'application/json'}}));
  }
  return new Promise((resolve,reject)=>{queue.push({input,options,resolve,reject});pump();});
 };
 window.__nativeUploadXHR=window.XMLHttpRequest;const xhrs=[];window.__progressXhrs=xhrs;
 window.XMLHttpRequest=class {
  constructor(){this.upload={};this.headers={};}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  getAllResponseHeaders(){return 'Content-Type: application/json';}
  abort(){this.onabort?.();}
  send(body){if(this.url.endsWith('/inspect')){this.status=200;this.statusText='OK';this.responseURL=location.origin+this.url;this.response=new TextEncoder().encode(JSON.stringify({folders:['Archive','Archive/2026','Notes']})).buffer;queueMicrotask(()=>this.onload());return;}this.body=body;xhrs.push(this);if(this.url.endsWith('/restore-batch'))window.__backupFolders=JSON.parse(body.get('folders'));if(this.url.endsWith('/restore-batch'))window.__backupUploads=body.getAll('backups').map(file=>file.name);}
 };
 window.__uploadBytes=(index,loaded,total=100)=>{xhrs[index].upload.onprogress({lengthComputable:true,loaded,total});};
 window.__uploadServer=index=>{xhrs[index].upload.onload();};
 window.__uploadFinish=(index,status=200,body={})=>{const xhr=xhrs[index];xhr.status=status;xhr.statusText=status===200?'OK':'Bad Request';xhr.responseURL=location.origin+xhr.url;xhr.response=new TextEncoder().encode(JSON.stringify(body)).buffer;xhr.onload();};
 window.confirm=()=>true;
 }`});
 await call('Page.navigate',{url:base+'/app'});
 await wait("!!document.querySelector('#fileBackupFolderTree button')");
 await evaluate("document.querySelector('[data-view=file-backups]').click()");
 await wait("document.querySelector('#fileBackupBody').textContent.includes('1 / 2')");
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreInput').multiple"),true);
 await evaluate(`window.__chooseRestoreFiles=(id,names)=>{const input=document.getElementById(id);Object.defineProperty(input,'files',{configurable:true,value:names.map(name=>new File(['fixture'],name))});input.dispatchEvent(new Event('change',{bubbles:true}));};`);
 for (const prefix of ['backup','fileBackup']) {
   const names=prefix==='backup'?['batch.manifest.json','batch.dump.part-0001']:['part-1.zip','part-2.zip'];
   assert.equal(await evaluate(`document.getElementById('${prefix}RestoreInput').multiple`),true);
   await evaluate(`window.__chooseRestoreFiles('${prefix}RestoreInput',${JSON.stringify([names[0]])})`);
   await evaluate(`window.__chooseRestoreFiles('${prefix}RestoreInput',${JSON.stringify([names[1]])})`);
   await wait(`document.querySelectorAll('#${prefix}RestoreQueue li').length===2`);
   await evaluate(`window.__chooseRestoreFiles('${prefix}RestoreInput',${JSON.stringify([names[1]])})`);
   assert.equal(await evaluate(`document.querySelectorAll('#${prefix}RestoreQueue li').length`),2);
   await evaluate(`document.querySelector('#${prefix}RestoreQueue button').click()`);
   assert.equal(await evaluate(`document.querySelectorAll('#${prefix}RestoreQueue li').length`),1);
   await evaluate(`document.getElementById('${prefix}RestoreClearButton').click()`);
   assert.equal(await evaluate(`document.querySelectorAll('#${prefix}RestoreQueue li').length`),0);
   assert.equal(await evaluate(`document.getElementById('${prefix}RestoreButton').disabled`),true);
 }

 await evaluate(`{
 const input=document.querySelector('#fileBackupRestoreInput');
 const files=[new File(['one'],'part-1.zip'),new File(['two'],'part-2.zip')];
 files.forEach(file=>Object.defineProperty(file,'size',{value:300*1024*1024}));
 Object.defineProperty(input,'files',{configurable:true,value:files});input.dispatchEvent(new Event('change',{bubbles:true}));
 }`);
 await wait("!document.querySelector('#fileBackupRestoreButton').disabled");
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreFolderTree').textContent.includes('2026')"),true);
 await evaluate("document.querySelector('#fileBackupRestoreFolderTree input[data-folder=\"\"]').click()");
 await evaluate("document.querySelector('#fileBackupRestoreFolderTree input[data-folder=Archive]').closest('.file-backup-folder-row').querySelector('button').click()");
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreFolderTree input[data-folder=\"Archive/2026\"]').closest('.file-backup-folder-children').hidden"),false);
 await evaluate("document.querySelector('#fileBackupRestoreFolderTree input[data-folder=\"Archive/2026\"]').click();document.querySelector('#fileBackupRestoreFolderTree input[data-folder=Notes]').click()");
 assert.deepEqual(await evaluate("JSON.parse(document.querySelector('#fileBackupRestoreFolder').value).sort()"),['Archive/2026','Notes']);
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreFolderTree input[data-folder=Archive]').indeterminate"),true);
 await evaluate("document.querySelector('#fileBackupRestoreButton').click()");
 await wait("window.__backupUploads?.length===2");
 assert.deepEqual(await evaluate("window.__backupUploads"),['part-1.zip','part-2.zip']);
 assert.deepEqual(await evaluate("window.__backupFolders.sort()"),['Archive/2026','Notes']);
 assert.deepEqual(await evaluate("[...document.querySelectorAll('#fileBackupSelectedFiles strong')].map(node=>node.textContent)"),['part-1.zip','part-2.zip']);
 await evaluate("window.__uploadBytes(0,50)");
 assert.equal(await evaluate("document.querySelector('#fileBackupProgressPanel progress').value"),50);
 await evaluate("window.__uploadServer(0)");
 assert.equal(await evaluate("document.querySelector('#fileBackupProgressPanel progress').hasAttribute('value')"),false);
 assert.equal(await evaluate("document.querySelector('#fileBackupRestoreButton').disabled"),true);
 await evaluate("window.__uploadFinish(0,200,{fileCount:2,partCount:2})");
 await wait("document.querySelector('#fileBackupRestoreButton').disabled && !document.querySelector('#fileBackupCreateButton').disabled");
 assert.equal(await evaluate("document.querySelector('#fileBackupProgressPanel progress').value"),100);
 await evaluate("document.querySelector('#fileBackupCreateButton').click()");
 await wait("document.querySelector('#fileBackupStatus').textContent.includes('9 file')");
 assert.ok((await evaluate("document.querySelector('#fileBackupStatus').textContent")).includes('Policy/missing.pdf'));
 assert.equal(await evaluate("document.querySelectorAll('#fileBackupFolderTree button').length"),4);
 if(process.env.BACKUP_FOLDERS_ONLY==='1'){assert.equal(errors.length,0,errors.join('\n'));console.log('PASS backup folder tree: collapse/expand, multiple checkboxes, indeterminate parents, archive folders and restore payload');return;}
 const routes=['/api/files/batch','/api/files/Policy/test.pdf','/api/policy-register','/api/audit-finding-tracker','/api/asset-management/assets','/api/asset-management/photos/assets/test','/api/asset-management/import','/api/knowledge-notes/images','/api/knowledge-notes/import-with-images'];
 for(const route of routes){
  const index=await evaluate(`{const body=new FormData();body.append('file',new File(['payload'],'${route.split('/').at(-1)}-fixture.pdf'));window.__sharedResult=fetch('${route}',{method:'POST',body}).then(response=>response.json());window.__progressXhrs.length-1;}`);
  await evaluate(`window.__uploadBytes(${index},35)`);
  assert.equal(await evaluate("document.querySelector('#appUploadCenter .app-upload-task:last-child progress').value"),35);
  await evaluate(`window.__uploadServer(${index})`);
  assert.equal(await evaluate("document.querySelector('#appUploadCenter .app-upload-task:last-child progress').hasAttribute('value')"),false);
  await evaluate(`window.__uploadFinish(${index},200,{ok:true})`);
  assert.equal(await evaluate("window.__sharedResult.then(body=>body.ok)"),true);
 }
 const nativeIndex=await evaluate("{window.__fakeUploadXHR=window.XMLHttpRequest;window.XMLHttpRequest=window.__nativeUploadXHR;const body=new FormData();body.append('file',new File([new Uint8Array(16*1024)],'native-real.pdf'));window.__nativeResult=fetch('/api/upload-progress-fixture',{method:'POST',body}).then(response=>response.json());true;}");
 await wait("document.querySelector('#appUploadCenter .app-upload-task:last-child').dataset.phase==='processing'");
 assert.equal(await evaluate("document.querySelector('#appUploadCenter .app-upload-task:last-child progress').hasAttribute('value')"),false);
 assert.ok((await evaluate("window.__nativeResult")).receivedBytes>16*1024);
 await evaluate("window.XMLHttpRequest=window.__fakeUploadXHR");
 const pair=await evaluate(`{const body=new FormData();body.append('file',new File(['data'],'failure-fixture.pdf'));window.__errorResult=fetch('/api/files/batch',{method:'POST',body}).then(r=>r.status);window.__parallelResult=fetch('/api/files/batch',{method:'POST',body}).then(r=>r.status);[window.__progressXhrs.length-2,window.__progressXhrs.length-1];}`);
 await evaluate(`window.__uploadBytes(${pair[0]},20);window.__uploadBytes(${pair[1]},70);window.__uploadFinish(${pair[0]},400,{error:'Fixture rejected'});window.__uploadFinish(${pair[1]},200,{ok:true})`);
 assert.equal(await evaluate("window.__errorResult"),400);assert.equal(await evaluate("window.__parallelResult"),200);
 assert.ok((await evaluate("document.querySelector('#appUploadCenter').textContent")).includes('Fixture rejected'));
 assert.equal(await evaluate("document.querySelector('#appUploadCenter .app-upload-task[data-phase=error] progress').value"),0);
 const modalIndex=await evaluate(`{const dialog=document.createElement('dialog');dialog.id='uploadFixtureDialog';document.body.append(dialog);dialog.showModal();const body=new FormData();body.append('file',new File(['data'],'modal-fixture.pdf'));window.__modalResult=fetch('/api/files/batch',{method:'POST',body}).then(r=>r.status);window.__progressXhrs.length-1;}`);
 assert.equal(await evaluate("document.querySelectorAll('#uploadFixtureDialog .app-upload-task').length"),1);
 await evaluate("document.querySelector('#uploadFixtureDialog').close();document.querySelector('#uploadFixtureDialog').remove()");
 await evaluate(`window.__uploadFinish(${modalIndex},200,{ok:true})`);assert.equal(await evaluate("window.__modalResult"),200);
 await evaluate("document.querySelector('[data-view=backups]').click();document.querySelector('#backupCreateButton').click()");
 await wait("!!window.__dbBackupDone");
 assert.equal(await evaluate("document.querySelector('#backupProgressPanel').hidden"),false);
 assert.equal(await evaluate("document.querySelector('#backupProgressPanel progress').hasAttribute('value')"),false);
 await evaluate("window.__dbBackupDone()");await wait("!document.querySelector('#backupCreateButton').disabled");
 assert.equal(await evaluate("document.querySelector('#backupProgressPanel progress').value"),100);
 const dbIndex=await evaluate(`{const input=document.querySelector('#backupRestoreInput');Object.defineProperty(input,'files',{configurable:true,value:[new File(['dump'],'nist-basis-20261011T000000Z.dump')]});input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#backupRestoreButton').click();window.__progressXhrs.length-1;}`);
 await evaluate(`window.__uploadBytes(${dbIndex},60)`);assert.equal(await evaluate("document.querySelector('#backupProgressPanel progress').value"),60);
 await evaluate(`window.__uploadServer(${dbIndex})`);assert.equal(await evaluate("document.querySelector('#backupProgressPanel progress').hasAttribute('value')"),false);
 assert.equal(await evaluate("document.querySelector('#backupRestoreInput').disabled"),true);
 await evaluate(`window.__uploadFinish(${dbIndex},200,{fileName:'nist-basis-20261011T000000Z.dump',restored:true})`);
 await wait("!document.querySelector('#backupReloginLink').hidden");assert.equal(await evaluate("document.querySelector('#backupProgressPanel progress').value"),100);
 await evaluate("document.documentElement.dataset.theme='dark'");
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:850,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.querySelector('#appUploadCenter').getBoundingClientRect().right<=innerWidth"),true);
 assert.equal(await evaluate("document.querySelector('#appUploadCenter').scrollWidth<=document.querySelector('#appUploadCenter').clientWidth+1"),true);
 const screenshot=await call('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.join(__dirname,'../output'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../output/upload-progress-mobile-dark.png'),Buffer.from(screenshot.data,'base64'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS upload progress: batch filenames, measured upload/server phases, 9 module routes, concurrent/error/modal states, database backup/restore, mobile/dark rendering');
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-file-backup-workspace-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
