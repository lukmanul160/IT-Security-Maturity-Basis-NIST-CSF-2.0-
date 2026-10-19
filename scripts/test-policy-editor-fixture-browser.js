const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const express=require('express');
(async()=>{
 const app=express(), errors=[]; let browser,ws,server;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'policy-editor-fixture-'));
 try {
 const fixture=await require('../src/services/statementDocumentService').plain('POLICY FIXTURE CONTENT');
 app.get('/api/policy-register/1/document',(req,res)=>res.set('X-Document-Revision','fixture').send(fixture));
 app.get('/statement-assets/superdoc.css',(req,res)=>res.sendFile(path.resolve('node_modules/superdoc/dist/style.css')));
 app.use('/statement-assets',express.static(path.resolve('node_modules/superdoc/dist')));
 app.get('/editor.js',(req,res)=>res.type('js').send(fs.readFileSync('frontend/client/src/services/statementWordEditor.js','utf8')));
 const source=fs.readFileSync('frontend/client/src/workspace/features/policy-register/register-and-calendar.js','utf8');
 const fragment=source.slice(source.indexOf('function canEditPolicyDocument'),source.indexOf('function getPolicyNextReviewDate'));
 app.get('/',(req,res)=>res.send(`<body><style>${fs.readFileSync('frontend/client/src/styles/policy-word-editor.css','utf8')}</style><script>window.NistStatementEditor=()=>import('/editor.js');const workspaceUserReady=Promise.resolve({});const canManagePolicyRegister=()=>true;${fragment};openPolicyDocumentEditor({id:1,title:'Fixture',attachmentName:'fixture.docx'});</script>`));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const port=10000+Math.floor(Math.random()*1000);
 browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(ws);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise(r=>{const id=++seq;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
 await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 let state;
 for(let i=0;i<750;i++){state=await evaluate(`({text:document.body.innerText,status:document.querySelector('[role=status]')?.textContent,buttons:document.querySelector('.policy-word-toolbar')?.children.length || 0,ready:document.querySelector('.primary')?.disabled===false})`);if(state?.ready||errors.length)break;await new Promise(r=>setTimeout(r,100));}
 console.log(JSON.stringify({state,errors}));assert.equal(state?.ready,true);assert.ok(state.text.includes('POLICY FIXTURE CONTENT'));assert.ok(state.buttons>0);
 console.log('PASS: actual SuperDoc toolbar and DOCX fixture content rendered in Chrome without database.');
 }finally{ws?.close();browser?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}console.log('Temporary Chrome profile: '+profile);}
})().catch(e=>{console.error(e);process.exitCode=1});

