const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
// Browser startup requests share the database with the running local app.
pool.options.connectionTimeoutMillis=30000;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let server,chrome,ws,typeId;const policyIds=[],filePaths=new Set();const marker='policy-word-browser-'+Date.now(),profile=path.join(os.tmpdir(),marker);
try{
 await require('../src/services/statementService').ensureStore();
 await require('../src/services/permissionService').ensureStore();
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);
 const auth=require('../src/config/auth'),token=auth.createSession({username:user.username,role:'admin'});
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const port=9900+Math.floor(Math.random()*90);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<60;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
 assert.ok(ws);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map(),errors=[];
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser protocol timeout: '+method));},30000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<600;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+' '+JSON.stringify(errors)+' '+await evaluate('document.body.innerText.slice(0,1200)'));};
 await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.S=id=>document.querySelector('#statementAdminView [data-statement-id="'+id+'"]');`});await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

 const documents=require('../src/services/statementDocumentService'),policies=require('../src/services/policyRegisterService'),storage=require('../src/services/storageService');
 const original=await documents.plain('POLICY WORD DRAFT');
 for(const [status,name] of [['Draft','draft.docx'],['Approved','approved.docx'],['Draft','legacy.doc']]){
  const body=new FormData();body.set('data',JSON.stringify({title:marker+'-'+name,category:'Cybersecurity',owner:'CISO',reviewCycle:'Annual',approvalStatus:status}));body.set('file',new Blob([original],{type:name.endsWith('.doc')?'application/msword':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),name);
  const response=await fetch(base+'/api/policy-register',{method:'POST',headers:{cookie:auth.sessionCookie+'='+token},body});const row=await response.json();assert.equal(response.status,201,JSON.stringify(row));policyIds.push(row.id);filePaths.add(row.attachmentPath);
 }
 await call('Page.navigate',{url:base+'/app#policy-register'});
 await wait("!!document.querySelector('[data-view=policy-register]')");await evaluate("document.querySelector('[data-view=policy-register]').click()");
 await wait(`!!document.querySelector('[data-policy-document-edit="${policyIds[0]}"]')`);
 assert.equal(await evaluate(`!!document.querySelector('[data-policy-document-edit="${policyIds[1]}"]')`),true);
 assert.equal(await evaluate(`!!document.querySelector('[data-policy-document-edit="${policyIds[2]}"]')`),false);
 await evaluate(`document.querySelector('[data-policy-document-edit="${policyIds[0]}"]').click()`);
 await wait("!!document.querySelector('.policy-word-editor')&&!document.querySelector('.policy-word-editor .primary').disabled");
 const point=await evaluate("(()=>{const walk=document.createTreeWalker(document.querySelector('.policy-word-canvas'),NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode()){if(n.textContent.includes('POLICY WORD DRAFT')){const range=document.createRange();range.selectNodeContents(n);const r=range.getBoundingClientRect();if(r.width&&r.height&&r.top>0&&r.top<innerHeight)return{x:r.left+10,y:r.top+r.height/2};}}throw Error('Paragraph not visible')})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',modifiers:2,windowsVirtualKeyCode:36});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',modifiers:2,windowsVirtualKeyCode:36});await call('Input.insertText',{text:'POLICY-EDIT-SAVED '});
 await wait("document.querySelector('.policy-word-canvas').textContent.includes('POLICY-EDIT-SAVED')");
 fs.mkdirSync('output',{recursive:true});const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/policy-word-editor.png',Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('.policy-word-editor .primary').click()");await wait("!document.querySelector('.policy-word-editor')||(!document.querySelector('.policy-word-editor .primary').disabled&&document.querySelector('.policy-word-editor [role=status]').textContent!=='Perubahan belum disimpan.')");assert.equal(await evaluate("!!document.querySelector('.policy-word-editor')"),false,await evaluate("document.querySelector('.policy-word-editor [role=status]')?.textContent"));
 const saved=(await policies.list()).find(row=>row.id===policyIds[0]);filePaths.add(saved.attachmentPath);assert.notEqual(saved.attachmentPath,[...filePaths][0]);
 const savedText=(await documents.inspect(await storage.read(saved.attachmentPath))).body;assert.ok(savedText.includes('POLICY-EDIT-SAVED'),JSON.stringify(savedText));assert.deepEqual(await storage.read([...filePaths][0]),original);
 const revisionResponse=await fetch(base+'/api/policy-register/'+policyIds[0]+'/document',{headers:{cookie:auth.sessionCookie+'='+token}});const revision=revisionResponse.headers.get('x-document-revision');assert.equal(revisionResponse.status,200);
 const put=async rev=>{const body=new FormData();body.set('revision',rev);body.set('document',new Blob([original]),'draft.docx');return fetch(base+'/api/policy-register/'+policyIds[0]+'/document',{method:'PUT',headers:{cookie:auth.sessionCookie+'='+token},body});};
 assert.equal((await put('stale')).status,409);await policies.update(policyIds[0],{approvalStatus:'Approved'});assert.equal((await put(revision)).status,409);
 console.log('PASS: DOCX action across approval statuses, Word editor typing/save, separate file version, unchanged original, stale revision and approval-change rejection.');
 }finally{
  for(const id of policyIds){const row=(await pool.query('SELECT attachment_path FROM policy_register WHERE id=$1',[id])).rows[0];if(row?.attachment_path)filePaths.add(row.attachment_path);await pool.query('DELETE FROM policy_register WHERE id=$1',[id]);}
  for(const value of filePaths){await require('../src/services/storageService').remove(value);await pool.query('DELETE FROM evidence_files WHERE path=$1',[value]);}
  ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();
  const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('policy-word-browser-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{console.log('Chrome profile remains in temp while locked.');}}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
