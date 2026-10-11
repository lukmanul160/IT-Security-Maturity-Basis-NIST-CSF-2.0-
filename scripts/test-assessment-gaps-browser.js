// Verify per-control gaps in the built workspace; gap API mutations use isolated in-memory fixtures.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-gap-workspace-'+Date.now());
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
 await require('../src/services/assessmentGapService').ensureStore();
 const codes=Object.fromEntries((await pool.query("SELECT DISTINCT ON(framework_id) framework_id,code FROM controls WHERE framework_id IN ('csf','privacy','iso27001','iso27001-soa') ORDER BY framework_id,length(code),code")).rows.map(row=>[row.framework_id,row.code]));
 const fixtures=Object.fromEntries(Object.entries(codes).map(([framework,code])=>[framework,Array.from({length:framework==='csf'?9:2},(_,i)=>({id:crypto.randomUUID(),framework,controlCode:code,description:'Kurang poin '+(i+1),status:i===1?'Closed':'Open',evidence:[],updatedBy:'Gap Browser Fixture',updatedAt:new Date().toISOString()}))]));
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
 const originalFetch=window.fetch.bind(window),fixtures=${JSON.stringify(fixtures)},queue=[];let active=0;
 const nativeFetch=(input,options)=>new Promise((resolve,reject)=>{queue.push({input,options,resolve,reject});pump();});
 function pump(){while(active<3&&queue.length){const job=queue.shift();active++;originalFetch(job.input,job.options).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
 window.fetch=async(input,options={})=>{
 const url=typeof input==='string'?input:input.url;
 if(url.startsWith('/api/files?'))return new Response(JSON.stringify([{path:'upload/Govern/Practice/search/poin-a.pdf',name:'poin-a.pdf',source:'Govern',type:'application/pdf'},{path:'upload/ISO 27001/Policy/search/capture.png',name:'capture.png',source:'ISO 27001',type:'image/png'}]),{headers:{'Content-Type':'application/json'}});
 if(!url.includes('/api/assessment-gaps/'))return nativeFetch(input,options);
 const parts=url.split('/api/assessment-gaps/')[1].split('/'),framework=parts[0],code=decodeURIComponent(parts[1]||''),id=parts[2],method=options.method||'GET';
 let body;
 if(method==='GET')body=fixtures[framework]||[];
 else if(method==='DELETE'){fixtures[framework]=fixtures[framework].filter(row=>row.id!==id);body={ok:true};}
 else{const data=JSON.parse(options.body),row={...data,id:id||crypto.randomUUID(),framework,controlCode:code,updatedAt:new Date().toISOString(),updatedBy:'Gap Browser Fixture'};if(id)fixtures[framework]=fixtures[framework].map(item=>item.id===id?row:item);else fixtures[framework].push(row);body=row;}
 return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
 };
 }`});
 await call('Page.navigate',{url:base+'/app'});
 await wait("!!document.querySelector('#csfTableBody [data-assessment-gaps]')");
 await evaluate("document.querySelector('[data-view=csf]').click();document.querySelector('[data-csf-tab=core]').click()");
 await wait(`!!document.querySelector('[data-assessment-gaps="csf"][data-gap-control="${codes.csf}"]')`);
 await evaluate(`document.querySelector('[data-assessment-gaps="csf"][data-gap-control="${codes.csf}"]').click()`);
 await wait("document.querySelectorAll('#assessmentGapDialog .gap-record').length===8");
 await wait("document.querySelector('#gapEvidenceSelect')?.options.length===3");
 await evaluate("document.querySelector('#gapEvidenceSearch').value='POIN-A';document.querySelector('#gapEvidenceSearch').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('#gapEvidenceSelect').options.length"),2);
 assert.equal(await evaluate("document.querySelector('#gapEvidenceSelect').options[1].textContent.includes('poin-a.pdf')"),true);
 await evaluate("document.querySelector('#gapEvidenceSearch').value='does-not-exist';document.querySelector('#gapEvidenceSearch').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('#gapEvidenceSelect').disabled"),true);
 await evaluate("document.querySelector('#gapEvidenceSearch').value='ISO 27001';document.querySelector('#gapEvidenceSearch').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('#gapEvidenceSelect').options[1].textContent.includes('capture.png')"),true);
 await evaluate("document.querySelector('#gapEvidenceSelect').value='1';document.querySelector('#gapEvidenceSelect').dispatchEvent(new Event('change',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('#gapDraftEvidence').textContent.includes('capture.png')"),true);
 assert.equal(await evaluate(`document.querySelector('.assessment-gap-cell [data-assessment-gaps="csf"][data-gap-control="${codes.csf}"]').closest('.assessment-gap-cell').querySelectorAll('.assessment-gap-preview').length`),3);
 assert.equal(await evaluate("document.querySelector('#assessmentGapForm select[name=status]').value"),'Open');
 await evaluate("document.querySelector('#assessmentGapDialog [data-gap-page=\"2\"]').click()");
 assert.equal(await evaluate("document.querySelectorAll('#assessmentGapDialog .gap-record').length"),1);
 await evaluate("document.querySelector('#assessmentGapForm textarea').value='Kurang poin tambahan';document.querySelector('#assessmentGapForm').requestSubmit()");
 await wait("document.querySelector('#gapDialogMessage').textContent.includes('10 gap')");
 await evaluate("document.querySelector('#assessmentGapDialog [data-gap-page=\"1\"]').click();document.querySelector('#assessmentGapDialog [data-gap-edit]').click()");
 await evaluate("document.querySelector('#assessmentGapForm textarea').value='Poin sudah dilengkapi';document.querySelector('#assessmentGapForm select[name=status]').value='Closed';document.querySelector('#assessmentGapForm').requestSubmit()");
 await wait("document.querySelector('.gap-record .gap-description')?.textContent==='Poin sudah dilengkapi'");
 assert.ok(['Closed','Ditutup'].includes(await evaluate("document.querySelector('.gap-record .gap-status').textContent"))); 
 await evaluate("document.querySelector('[data-gap-close]').click();document.querySelector('[data-csf-tab=overview]').click()");
 assert.equal(await evaluate("document.querySelector('[data-gap-summary=csf] [data-gap-filter=Closed] strong').textContent"),'2');
 await evaluate("document.querySelector('[data-csf-tab=gaps]').click()");
 await wait("document.querySelectorAll('#csfGapTabPanel .gap-record').length===8");
 assert.equal(await evaluate("document.querySelector('#csfGapTabPanel').hidden"),false);
 await evaluate("document.querySelector('#csfGapTabPanel [data-gap-tab-status]').value='Closed';document.querySelector('#csfGapTabPanel [data-gap-tab-status]').dispatchEvent(new Event('change',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelectorAll('#csfGapTabPanel .gap-record').length"),2);
 await evaluate("document.querySelector('#csfGapTabPanel [data-gap-tab-search]').value='Poin sudah';document.querySelector('#csfGapTabPanel [data-gap-tab-search]').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelectorAll('#csfGapTabPanel .gap-record').length"),1);
 await evaluate("document.querySelector('[data-csf-tab=overview]').click()");
 for(const framework of ['privacy','iso27001','iso27001-soa']){
   await wait(`!!document.querySelector('[data-assessment-gaps="${framework}"][data-gap-control="${codes[framework]}"]')`);
   await evaluate(`document.querySelector('[data-assessment-gaps="${framework}"][data-gap-control="${codes[framework]}"]').click()`);
   await wait("document.querySelectorAll('#assessmentGapDialog .gap-record').length===2");
   assert.equal(await evaluate("document.querySelectorAll('#assessmentGapDialog .gap-record .gap-evidence').length"),2);
   await evaluate("document.querySelector('[data-gap-close]').click()");
 }
 await evaluate("document.querySelector('[data-view=privacy]').click();document.querySelector('[data-privacy-tab=gaps]').click()");
 await wait("document.querySelectorAll('#privacyGapTabPanel .gap-record').length===2");
 assert.equal(await evaluate("document.querySelector('#privacyGapTabPanel').hidden"),false);
 await evaluate("document.querySelector('[data-view=iso27001]').click();document.querySelector('[data-iso-tab=gaps]').click()");
 await wait("document.querySelectorAll('#isoGapTabPanel .gap-record').length===4");
 assert.equal(await evaluate("document.querySelector('#isoGapTabPanel').hidden"),false);
 await evaluate("document.querySelector('[data-view=csf]').click();document.querySelector('[data-csf-tab=overview]').click()");
 await evaluate(`document.querySelector('[data-gap-monitor="csf"][data-gap-filter="missing"]').click()`);
 await wait("document.querySelectorAll('#assessmentGapDialog .gap-record').length===8");
 assert.equal(await evaluate("!!document.querySelector('#assessmentGapForm')"),false,'summary contains no redundant editable registry');
 for(const width of [1440,768,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await delay(200);
   assert.equal(await evaluate("document.querySelector('#assessmentGapDialog').scrollWidth>document.querySelector('#assessmentGapDialog').clientWidth+1"),false,'gap modal overflow '+width);
   for(const theme of ['dark','light']){await evaluate(`NistTheme.set('${theme}')`);await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,'page overflow '+width);}
 }
 await evaluate("NistTheme.set('dark')");await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(250);
 fs.writeFileSync('output/assessment-gaps-preview.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert.deepEqual(errors,[]);console.log('PASS: CSF, Privacy, ISO clauses and SOA gaps; multiple gaps, Open/Closed edits, 8-item pagination, dashboard drilldown, dark/light and responsive layout. No business records changed.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-gap-workspace-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
