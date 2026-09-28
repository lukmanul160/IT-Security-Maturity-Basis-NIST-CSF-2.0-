async function run() {
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profilePath}`,'about:blank'],{stdio:'ignore',windowsHide:true});let client;
 try{
  await waitForChrome();const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl+'/login')}`,{method:'PUT'})).json();client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const original=window.fetch;window.evidenceScenario='alice';window.fetch=async(input,options)=>{if(String(input)==='/api/files?details=true'){const all=[{name:'Alice-only.pdf',path:'upload/Govern/Policy/alice/file.pdf',source:'Uploaded files'},{name:'Bob-only.pdf',path:'upload/ISO 27001/Policy/bob/file.pdf',source:'Uploaded files'}];return new Response(JSON.stringify(window.evidenceScenario==='admin'?all:window.evidenceScenario==='empty'?[]:[all[0]]),{status:200,headers:{'Content-Type':'application/json'}});}return original(input,options);};})();`});
  await waitFor(client,`document.querySelector('#loginForm')`,'login');await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);
  await waitFor(client,`document.documentElement.dataset.frontend==='vue' && document.querySelector('[data-view="csf"]')`,'workspace');await delay(1200);
  for(const [view,tabSelector,tab,selector,pickerAttribute,toggleAttribute] of [
   ['csf','data-csf-tab','core','data-toggle-existing','data-existing-picker','data-toggle-existing'],
   ['privacy','data-privacy-tab','core','data-toggle-privacy-existing','data-privacy-existing-picker','data-toggle-privacy-existing'],
   ['iso27001','data-iso-tab','clauses','data-toggle-iso-existing','data-iso-existing-picker','data-toggle-iso-existing'],
   ['iso27001','data-iso-tab','soa','data-toggle-iso-existing','data-iso-existing-picker','data-toggle-iso-existing']
  ]){
   await evaluate(client,`document.querySelector('[data-view="${view}"]').click();document.querySelector('[${tabSelector}="${tab}"]').click()`);
   await waitFor(client,`Array.from(document.querySelectorAll('[${selector}]')).some(b=>b.getClientRects().length)`,'visible '+view+' picker');
   for(const scenario of ['alice','admin','empty']){
    await evaluate(client,`window.evidenceScenario='${scenario}';window.pickerButton=Array.from(document.querySelectorAll('[${selector}]')).find(b=>b.getClientRects().length);window.pickerKey=pickerButton.getAttribute('${toggleAttribute}');pickerButton.click()`);
    const expression=`Array.from(document.querySelectorAll('[${pickerAttribute}]')).find(p=>p.getAttribute('${pickerAttribute}')===window.pickerKey)`;
    await waitFor(client,`(${expression}).querySelectorAll('.existing-file-option').length===${scenario==='admin'?2:scenario==='empty'?0:1}`,'scoped options '+scenario);
    const text=await evaluate(client,`(${expression}).textContent`);
    assert.equal(text.includes('Alice-only.pdf'),scenario!=='empty');assert.equal(text.includes('Bob-only.pdf'),scenario==='admin');
   }
  }
  console.log('PASS: CSF, Privacy, ISO clauses and SOA use only server-scoped library; admin sees both users; empty results clear old files. No data written.');
 }finally{client?.close();chrome.kill();await delay(1000);await removeBrowserProfile();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
