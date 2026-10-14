// Real browser downloads and import previews. No import is confirmed.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const auth=require('../src/config/auth');
const {Cdp}=require('./test-threat-modelling-browser');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nist-progress-excel-'));
  let server,chrome,cdp,token;
  try{
    const admin=(await pool.query("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];assert.ok(admin);
    token=auth.createSession({username:admin.username,role:'admin'});
    server=require('../src/app').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`,port=9700+Math.floor(Math.random()*100);
    chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let target;for(let i=0;i<100;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(100);}}assert.ok(target);
    cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('DOM.enable');
    await cdp.send('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
    await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:temp});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=window.fetch.bind(window);window.fetch=(url,options)=>String(url).includes('/api/audit/activity')?Promise.resolve(new Response('{}',{status:200,headers:{'Content-Type':'application/json'}})):original(url,options);`});
    await cdp.send('Page.navigate',{url:base+'/workspace'});
    await cdp.wait('document.documentElement.dataset.frontend === "vue"');
    // Trigger lazy personnel view so its transfer controls are included.
    await cdp.evaluate('document.querySelector("[data-view=personnel-certification]")?.click()');
    const modules=['iso27001','risk-acceptance','risk-management','policy-register','personnel','tprm-questionnaire','questionnaire-templates','tprm-register','threat-modelling','knowledge-notes','audit-finding-tracker'];
    for(const key of modules){
      console.log('Checking Excel: '+key);
      await cdp.wait(`!!document.querySelector('[data-excel-template="${key}"]')`);
      await cdp.evaluate(`document.querySelector('[data-excel-template="${key}"]').click()`);
      await cdp.wait(`document.querySelector('[data-module-transfer="${key}"] [role=status]').textContent.includes('unduhan dimulai')`);
      const filename=path.join(temp,key+'-template.xlsx');
      for(let i=0;i<100;i++){try{await fs.access(filename);break;}catch{await delay(100);}}
      const codec=await import('../frontend/client/src/services/moduleProgressWorkbook.mjs');
      assert.equal(codec.readProgressWorkbook(await fs.readFile(filename),key).module,key);
      const node=await cdp.send('DOM.getDocument');
      const input=await cdp.send('DOM.querySelector',{nodeId:node.root.nodeId,selector:`input[name="${key}-progress-excel"]`});assert.ok(input.nodeId);
      await cdp.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[filename]});
      try{await cdp.wait('!!document.querySelector("dialog[open] [data-confirm]")');}
      catch(error){console.error(await cdp.evaluate(`document.querySelector('[data-module-transfer="${key}"]').textContent`));console.error(cdp.errors);throw error;}
      await cdp.evaluate('document.querySelector("dialog[open] [data-cancel]").click()');
    }
    assert.deepEqual(cdp.errors,[]);
    console.log('PASS: 11 module Excel template downloads, workbook reads, import previews, and cancellation without data writes.');
  }finally{
    cdp?.socket.close();chrome?.kill();if(token)auth.destroySession(token);
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end();
    const resolved=path.resolve(temp);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-progress-excel-')){await delay(1000);await fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});}
  }
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
