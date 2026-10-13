// Exercises real Excel download and read-only import previews. Production data is not imported.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {pool}=require('../src/config/database'),auth=require('../src/config/auth'),{Cdp}=require('./test-threat-modelling-browser'),workbook=require('../src/services/maturityWorkbookService');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nist-maturity-excel-'));let server,chrome,cdp,token;
 try{
  const before=(await pool.query("SELECT framework_id,COUNT(*)::int AS count FROM controls WHERE framework_id IN ('csf','privacy') GROUP BY framework_id ORDER BY framework_id")).rows;
  const admin=(await pool.query("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];assert.ok(admin);
  token=auth.createSession({username:admin.username,role:'admin'});server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`,port=9840+Math.floor(Math.random()*50);
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(100);}}assert.ok(target);cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('DOM.enable');
  await cdp.send('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:temp});
  // Transfer audit calls are test fixtures, so preview/download checks do not create production events.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('nist-assessment-years',JSON.stringify({csf:2026,privacy:2026}));const original=window.fetch.bind(window);window.fetch=(url,options)=>String(url).includes('/api/audit/activity')?Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}})):original(url,options);`});
  await cdp.send('Page.navigate',{url:base+'/app'});await cdp.wait('document.querySelector("[data-maturity-export=csf]") && document.querySelector("#currentUser").textContent==="admin"');
  for(const framework of ['csf','privacy']){
   await cdp.evaluate(`document.querySelector('[data-view=${framework}]').click();NistI18n.setLanguage('en');NistTheme.set('dark')`);
   await cdp.wait(`document.querySelector('.active-view [data-maturity-export=${framework}]')`);
   assert.equal(await cdp.evaluate(`document.querySelector('.active-view [data-maturity-export=${framework}]').textContent`),'Export Excel');
   await cdp.evaluate(`document.querySelector('.active-view [data-maturity-export=${framework}]').click()`);
   const file=path.join(temp,`NIST-${framework==='csf'?'CSF-2.0':'Privacy'}-Maturity-2026.xlsx`);let buffer;
   for(let i=0;i<100;i++){try{buffer=await fs.readFile(file);break;}catch{await delay(150);}}assert.ok(buffer,'Excel download must finish');assert.ok(workbook.read(buffer,framework).controls.length);
   const fixture=path.join(temp,framework+'-import.xlsx');await fs.writeFile(fixture,buffer);
   const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:`.active-view input[name="${framework}-maturity-excel"]`});assert.ok(nodeId);
   await cdp.send('DOM.setFileInputFiles',{nodeId,files:[fixture]});await cdp.wait('document.querySelector("dialog.module-import-dialog[open]")');
   assert.ok(await cdp.evaluate('document.querySelector("dialog.module-import-dialog").textContent.includes("Empty maturity cells clear")'));
   await cdp.evaluate('NistI18n.setLanguage("id")');await cdp.wait('document.querySelector("dialog.module-import-dialog").textContent.includes("Kolom maturity kosong")');
   await fs.writeFile(`output/${framework}-excel-import-preview.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
   await cdp.evaluate('document.querySelector("dialog.module-import-dialog [data-cancel]").click()');
  }
  const after=(await pool.query("SELECT framework_id,COUNT(*)::int AS count FROM controls WHERE framework_id IN ('csf','privacy') GROUP BY framework_id ORDER BY framework_id")).rows;assert.deepEqual(after,before);assert.deepEqual(cdp.errors,[]);console.log('PASS: CSF and Privacy Excel downloads, readable bilingual previews, cancellation, and unchanged production controls.');
 }finally{cdp?.socket.close();chrome?.kill();if(token)auth.destroySession(token);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(temp);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-maturity-excel-')){await delay(1000);await fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});}}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
