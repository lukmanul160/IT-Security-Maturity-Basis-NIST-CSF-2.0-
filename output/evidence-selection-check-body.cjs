async function run() {
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profilePath}`,'about:blank'],{stdio:'ignore',windowsHide:true});let client;
 try{
  await waitForChrome();const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl+'/login')}`,{method:'PUT'})).json();client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const original=window.fetch;window.evidenceWrites=[];window.fetch=async(input,options)=>{const url=String(input);if(url==='/api/files?details=true')return new Response(JSON.stringify(Array.from({length:25},(_,i)=>({name:'Owned-'+String(i).padStart(2,'0')+'.pdf',path:'upload/Govern/Policy/test/'+i+'.pdf',source:'Uploaded files'}))),{headers:{'Content-Type':'application/json'}});if(['/api/assessment','/api/privacy/assessment'].includes(url)&&options?.method==='PUT'){const data=JSON.parse(options.body);window.evidenceWrites.push({url,data});return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}window.pendingEvidenceRequests=(window.pendingEvidenceRequests||0)+1;try{return await original(input,options);}finally{window.pendingEvidenceRequests--;window.lastEvidenceResponse=Date.now();}};})();`});
  await waitFor(client,`document.querySelector('#loginForm')`,'login');await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);
  await waitFor(client,`document.documentElement.dataset.frontend==='vue' && document.querySelector('[data-view="csf"]')`,'workspace');await waitFor(client,`window.pendingEvidenceRequests===0 && Date.now()-window.lastEvidenceResponse>1000`,'initial data settled',60000);
  for(const [view,mode] of [['csf','core'],['csf','assessment'],['privacy','core'],['privacy','assessment']]){
   const privacy=view==='privacy';const toggle=privacy?'data-toggle-privacy-existing':'data-toggle-existing';const picker=privacy?'data-privacy-existing-picker':'data-existing-picker';const option=privacy?'data-use-privacy-existing':'data-use-existing';const search=privacy?'data-privacy-existing-search':'data-existing-search';const page=privacy?'data-privacy-existing-page':'data-existing-page';
   await evaluate(client,`document.querySelector('[data-view="${view}"]').click();document.querySelector('[data-${view}-tab="core"]').click()`);
   if(mode==='assessment')await evaluate(client,`document.querySelector('#${privacy?'privacyAssessmentButton':'csfAssessmentButton'}').click()`);
   await waitFor(client,`Array.from(document.querySelectorAll('[${toggle}]')).some(b=>b.getClientRects().length)`,'visible button');
   await evaluate(client,`window.clickedButton=Array.from(document.querySelectorAll('[${toggle}]')).find(b=>b.getClientRects().length);window.clickedPicker=clickedButton.closest('.attachment-control').querySelector('[${picker}]');window.selectedKey=clickedButton.getAttribute('${toggle}');clickedButton.click()`);
   try { await waitFor(client,`clickedPicker.classList.contains('visible') && clickedPicker.getClientRects().length && clickedPicker.querySelectorAll('[${option}]').length===20`,view+' '+mode+' popup visible'); }
   catch(error) { console.log(await evaluate(client,`({connected:clickedPicker.isConnected,classes:clickedPicker.className,rects:clickedPicker.getClientRects().length,options:clickedPicker.querySelectorAll('[${option}]').length,active:document.querySelector('.view.active-view')?.id,status:document.querySelector('#saveState').textContent})`)); throw error; }
   await evaluate(client,`clickedPicker.querySelector('[${page}][data-page="2"]').click()`);
   assert.equal(await evaluate(client,`clickedPicker.querySelectorAll('[${option}]').length`),5,view+' pagination');
   const selectedName=mode==='core'?'Owned-24':'Owned-23';
   await evaluate(client,`var input=clickedPicker.querySelector('[${search}]');input.focus();window.focusBefore={disabled:input.disabled,active:document.activeElement===input,html:input.outerHTML};input.value='${selectedName}';input.dispatchEvent(new Event('input',{bubbles:true}))`);
   assert.equal(await evaluate(client,`clickedPicker.querySelectorAll('[${option}]').length`),1,view+' search');
   assert.equal(await evaluate(client,`document.activeElement===clickedPicker.querySelector('[${search}]')`),true,view+' '+mode+' search retains focus '+JSON.stringify(await evaluate(client,`({before:window.focusBefore,active:document.activeElement.tagName,connected:clickedPicker.isConnected,display:getComputedStyle(clickedPicker).display,visible:clickedPicker.getClientRects().length})`)));
   const before=await evaluate(client,`window.evidenceWrites.length`);
   await evaluate(client,`clickedPicker.querySelector('[${option}]').click()`);
   await waitFor(client,`window.evidenceWrites.length>${before} && document.querySelector('#saveState').textContent==='Evidence tersimpan.'`,'save request');
   const saved=await evaluate(client,`window.evidenceWrites.at(-1)`);assert.equal(saved.url,privacy?'/api/privacy/assessment':'/api/assessment');assert.ok(saved.data.attachments[await evaluate(client,'window.selectedKey')].some(f=>f.name===selectedName+'.pdf'));
  }
  console.log('PASS: CSF and Privacy core + assessment: visible popup, pagination, search, select and save payload. No real records changed.');
 }finally{client?.close();chrome.kill();await delay(1000);await removeBrowserProfile();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
