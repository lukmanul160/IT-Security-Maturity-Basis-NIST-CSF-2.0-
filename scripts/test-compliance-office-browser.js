// Browser regression for Compliance and Office Design. Creates uniquely named fixtures and removes them in finally.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
// Allow slower local PostgreSQL handshakes during the browser regression.
pool.options.connectionTimeoutMillis=30000;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const marker='compliance-office-test-'+Date.now(); const profile=path.join(os.tmpdir(),'nist-compliance-office-'+Date.now());
 try{
 await require('../src/services/complianceService').ensureStore();
 await require('../src/services/officeDesignService').ensureStore();
 await require('../src/services/permissionService').ensureStore();
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user,'Existing administrator available');
 const auth=require('../src/config/auth'),token=auth.createSession({username:user.username,role:'admin'});
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const port=9800+Math.floor(Math.random()*100);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<60;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
 assert.ok(ws,'Chrome available');await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map(),errors=[],requests=[];
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.id){waiting.get(m.id)(m);waiting.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{waiting.set(++id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<600;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+'; errors: '+JSON.stringify(errors)+'; asset status: '+await evaluate("location.href+' '+document.querySelector('.view.active-view')?.id+' list: '+document.getElementById('complianceReportStatus').textContent+' form: '+document.getElementById('complianceReportFormStatus').textContent+' invalid: '+JSON.stringify([...document.getElementById('complianceReportForm').elements].filter(e=>e.willValidate&&!e.validity.valid).map(e=>({name:e.name,message:e.validationMessage})))"));};
 await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:"const loaderObserver=new MutationObserver(()=>{if(document.querySelector('#governanceLoading img[src*=loading-logo]')){window.loadingLogoPresent=true;loaderObserver.disconnect();}});loaderObserver.observe(document,{childList:true,subtree:true});"});await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'&&!!document.querySelector('[data-theme-toggle]')");
 await wait("!document.getElementById('governanceLoading')");assert.equal(await evaluate('loadingLogoPresent'),true);
 assert.equal(await evaluate("document.documentElement.dataset.theme"),'light');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.header-owl-awake')).display"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.header-owl-body')).animationName"),'header-owl-breathe');
 await evaluate("document.querySelector('[data-theme-toggle]').click()");await wait("document.documentElement.dataset.theme==='dark'");assert.equal(await evaluate("localStorage.getItem('nist-basis-theme')"),'dark');assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"),'rgb(16, 24, 39)');assert.equal(await evaluate("getComputedStyle(document.querySelector('.sidebar')).backgroundColor"),'rgb(26, 38, 56)');


 await wait("document.getElementById('currentUser').textContent==='admin'");await delay(1200);
 // Startup must not preload unrelated registers or hidden recipient pickers.
 const initialPaths=requests.map(url=>new URL(url).pathname);
 for(const endpoint of ['/api/privacy','/api/privacy/assessment','/api/csf','/api/assessment','/api/risk-management','/api/risk-acceptance','/api/policy-register','/api/reminder-recipients','/api/files','/api/ikas','/api/ikas-template','/api/threat-modelling','/api/assessment-periods/csf','/api/assessment-periods/privacy','/api/assessment-periods/iso27001','/api/assessment-periods/ikas'])assert.equal(initialPaths.includes(endpoint),false,'Unexpected startup request: '+endpoint);
 console.log('Startup API requests:',JSON.stringify(initialPaths.filter(path=>path.startsWith('/api/'))));

 await evaluate("window.confirm=()=>true; window.testMarker="+JSON.stringify(marker));
 assert.equal(await evaluate("document.querySelector('[data-view=asset-dashboard]').nextElementSibling.dataset.view"),'office-design');
 await evaluate("document.querySelector('[data-view=reporting-regulator]').click()");
 await wait("document.getElementById('reportingRegulatorView').classList.contains('active-view')&&!document.getElementById('complianceReportNew').disabled");
 assert.equal(requests.some(url=>new URL(url).pathname==='/api/reminder-recipients'),false,'Hidden form must not fetch recipients');

 await evaluate("document.getElementById('complianceReportNew').click();{const f=document.getElementById('complianceReportForm');f.elements.useGlobalReminder.checked=false;f.elements.title.value=window.testMarker;f.elements.recipient.value='Regulator uji';f.elements.owner.value='PIC uji';f.elements.dueDate.value='2027-01-15';f.requestSubmit();}");
 await wait("!document.getElementById('complianceReportModal').open&&document.getElementById('complianceReportBody').textContent.includes(window.testMarker)");
 await evaluate("[...document.querySelectorAll('#complianceReportBody tr')].find(r=>r.textContent.includes(window.testMarker)).querySelector('[data-compliance-edit]').click();{const f=document.getElementById('complianceReportForm');f.elements.status.value='Dalam proses';f.requestSubmit();}");
 await wait("!document.getElementById('complianceReportModal').open&&[...document.querySelectorAll('#complianceReportBody tr')].some(r=>r.textContent.includes(window.testMarker)&&r.textContent.includes('Dalam proses'))");


 // Reproduce an old backend returning 404: show the cause, then recover on retry.
 await evaluate(`{const native=window.fetch;window.failureOriginalFetch=native;window.fetch=(url,options)=>String(url)==='/api/compliance/reports/reminder-settings'&&(!options?.method||options.method==='GET')?Promise.resolve(new Response('not found',{status:404})):native(url,options);document.getElementById('crSmtpTab').click();}`);
 await wait("!document.getElementById('crReminderRetry').hidden");
 assert.ok(await evaluate("document.getElementById('crReminderLoadStatus').textContent.includes('backend')"));
 assert.equal(await evaluate("document.getElementById('crReminderRecipientMode').disabled"),true);
 await evaluate("window.fetch=window.failureOriginalFetch;document.getElementById('crReminderRetry').click()");
 await wait("!document.getElementById('crReminderSave').disabled");
 assert.equal(await evaluate("document.getElementById('crReminderRecipientMode').disabled"),false);
 assert.equal(await evaluate("document.getElementById('crReminderOwners').parentElement.querySelector('select').disabled"),false);

 await wait("!document.getElementById('crSmtpAdmin').hidden&&!document.getElementById('crSmtpForm').elements.host.disabled");
 assert.equal(await evaluate("document.getElementById('crReportsPanel').hidden"),true);
 await evaluate("document.getElementById('crSmtpAdd').click();{const f=document.getElementById('crSmtpForm');f.elements.name.value=window.testMarker;f.elements.host.value='smtp.example.com';f.elements.username.value='test@example.com';f.elements.password.value='fixture-secret';f.elements.from.value='sender@example.com';f.requestSubmit();}");
 await wait("document.getElementById('crSmtpStatus').textContent.includes('Akun SMTP tersimpan')");

 await wait("!document.getElementById('crReminderSave').disabled");
 // Mapping pagination must retain every page in the hidden canonical field.
 for(const mappingId of ['aftReminderOwners','policySmtpOwners','crReminderOwners']){
   const result=await evaluate(`(()=>{const f=document.getElementById(${JSON.stringify(mappingId)}),original=f.value;f.disabled=false;f.value=Array.from({length:21},(_,i)=>'PIC '+String(i).padStart(2,'0')+' = pic'+i+'@example.com').join(String.fromCharCode(10));f.dispatchEvent(new Event('recipients-populated'));return {original,count:document.querySelector('[data-mapping-for="'+f.id+'"] [data-mapping-list]').children.length};})()`);
   assert.equal(result.count,8);
   await evaluate(`document.querySelector('[data-mapping-for="${mappingId}"] [data-mapping-next]').click()`);
   assert.equal(await evaluate(`document.querySelector('[data-mapping-for="${mappingId}"] [data-mapping-list]').children.length`),8);
   await evaluate(`document.querySelector('[data-mapping-for="${mappingId}"] [data-mapping-next]').click();document.querySelector('[data-mapping-for="${mappingId}"] [data-mapping-index="16"]').click()`);
   const remaining=await evaluate(`document.getElementById('${mappingId}').value.split(String.fromCharCode(10))`);
   assert.equal(remaining.length,20);assert.ok(remaining[0].startsWith('PIC 00'));assert.ok(!remaining.some(line=>line.startsWith('PIC 16')));
   if(mappingId!=='crReminderOwners')await evaluate(`document.getElementById('${mappingId}').value=${JSON.stringify(result.original)};document.getElementById('${mappingId}').dispatchEvent(new Event('recipients-populated'))`);
 }
 // Exercise settings submission with an isolated response, preserving live settings.
 await evaluate(`(async()=>{window.fixtureReminderSettings=await fetch('/api/compliance/reports/reminder-settings').then(r=>r.json());const native=window.fetch;window.fixtureOriginalFetch=native;window.fetch=(url,options)=>{if(String(url)==='/api/compliance/reports/reminder-settings'&&options?.method==='PUT'){window.fixtureReminderPayload=JSON.parse(options.body);return Promise.resolve(new Response(JSON.stringify({...window.fixtureReminderSettings,...window.fixtureReminderPayload}),{status:200,headers:{'Content-Type':'application/json'}}));}return native(url,options);};document.getElementById('crReminderRepeatEvery').value=5;document.getElementById('crReminderForm').requestSubmit();})()`);
 await wait("!!window.fixtureReminderPayload&&!document.getElementById('crReminderSave').disabled");
 assert.equal(await evaluate('window.fixtureReminderPayload.owners.length'),20);
 assert.equal(await evaluate('window.fixtureReminderPayload.repeatEvery'),5);
 assert.equal(await evaluate('window.fixtureReminderPayload.unlimited'),true);
 await evaluate('window.fetch=window.fixtureOriginalFetch');
 console.log('PASS: mapping pagination retains all rows and reminder settings submit every page.');
 const smtpId=await evaluate("document.getElementById('crSmtpAccount').value");assert.ok(smtpId&&smtpId!=='default');
 assert.equal(await evaluate("document.getElementById('crSmtpForm').elements.password.value"),'');
 await evaluate("{const f=document.getElementById('crSmtpForm');f.elements.port.value='465';f.elements.security.value='tls';f.requestSubmit();}");
 await wait("!document.getElementById('crSmtpForm').elements.host.disabled&&document.getElementById('crSmtpStatus').textContent.includes('Akun SMTP tersimpan')");
 assert.equal(await evaluate("document.getElementById('crSmtpForm').elements.port.value"),'465');
 const smtpShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('output/reporting-smtp-preview.png',Buffer.from(smtpShot.data,'base64'));
 await evaluate("document.getElementById('crReportsTab').click();[...document.querySelectorAll('#complianceReportBody tr')].find(r=>r.textContent.includes(window.testMarker)).querySelector('[data-compliance-edit]').click()");
 await wait("[...document.getElementById('complianceReportForm').elements.smtpAccountId.options].some(o=>o.value==="+JSON.stringify(smtpId)+")");
 await evaluate("{const f=document.getElementById('complianceReportForm');f.elements.smtpAccountId.value="+JSON.stringify(smtpId)+";f.elements.reminderEnabled.click();f.elements.reminderEmail.value='fixture@example.com';f.elements.continueOverdue.click();f.requestSubmit();}");
 await wait("!document.getElementById('complianceReportModal').open&&document.getElementById('complianceReportBody').textContent.includes('sampai dilaporkan')");
 const reporting=await evaluate("fetch('/api/compliance/reports').then(r=>r.json()).then(rows=>rows.find(r=>r.data.title===window.testMarker).data)");
 assert.equal(reporting.continueOverdue,true);assert.equal(reporting.repeatDaily,true);assert.equal(reporting.smtpAccountId,smtpId);
 await evaluate("[...document.querySelectorAll('#complianceReportBody tr')].find(r=>r.textContent.includes(window.testMarker)).querySelector('[data-compliance-edit]').click();{const f=document.getElementById('complianceReportForm');f.elements.status.value='Sudah dilaporkan';f.elements.status.dispatchEvent(new Event('change'));const files=new DataTransfer();files.items.add(new File(['%PDF-1.7 evidence'],window.testMarker+'.pdf',{type:'application/pdf'}));f.elements.files.files=files.files;f.requestSubmit();}");
 await wait("!document.getElementById('complianceReportModal').open&&document.getElementById('complianceReportBody').textContent.includes(window.testMarker+'.pdf')");
 const proof=await evaluate("(()=>{const row=[...document.querySelectorAll('#complianceReportBody tr')].find(r=>r.textContent.includes(window.testMarker));return fetch(row.querySelector('.compliance-evidence a').href).then(r=>r.text());})()");
 assert.equal(proof,'%PDF-1.7 evidence');
 // Link the finished fixture to shared SMTP and choose its PIC from the register.
 await evaluate("[...document.querySelectorAll('#complianceReportBody tr')].find(r=>r.textContent.includes(window.testMarker)).querySelector('[data-compliance-edit]').click();{const f=document.getElementById('complianceReportForm');f.elements.useGlobalReminder.checked=true;f.elements.useGlobalReminder.dispatchEvent(new Event('change'));}");
 assert.equal(await evaluate("document.getElementById('complianceReportLocalReminder').hidden"),true);
 const contact=await evaluate("window.NistReminderRecipients.registered.find(row=>row.email)");
 if(contact){
   await evaluate("{const host=document.getElementById('complianceReportOwnerPicker');host.querySelector('[type=search]').value="+JSON.stringify(contact.owner)+";host.querySelector('[type=search]').dispatchEvent(new Event('input'));host.querySelector('select').value="+JSON.stringify(contact.owner)+";host.querySelector('select').dispatchEvent(new Event('change'));}");
   assert.equal(await evaluate("document.getElementById('complianceReportForm').elements.owner.value"),contact.owner);
   assert.equal(await evaluate("document.getElementById('complianceReportForm').elements.reminderEmail.value"),'');
 }
 await evaluate("document.getElementById('complianceReportForm').requestSubmit()");
 await wait("!document.getElementById('complianceReportModal').open&&document.getElementById('complianceReportBody').textContent.includes('Mengikuti tab SMTP')");
 const relation=await evaluate("fetch('/api/compliance/reports').then(r=>r.json()).then(rows=>rows.find(r=>r.data.title===window.testMarker).reminder)");
 const context=await evaluate("fetch('/api/compliance/reports/reminder-context').then(r=>r.json())");
 assert.equal(relation.mode,'global');assert.equal(relation.smtpAccountId,context.smtpAccountId);
 assert.ok(relation.state.includes('Selesai'));
 if(contact)assert.deepEqual(relation.recipients,[contact.email]);
 console.log('PASS: report PIC shares the SMTP register; shared account/schedule/status are resolved on existing reports.');


 await evaluate("document.querySelector('[data-view=narahubung]').click()");
 await wait("document.getElementById('narahubungView').classList.contains('active-view')&&!document.getElementById('complianceContactNew').disabled");
 await evaluate("document.getElementById('complianceContactNew').click();{const f=document.getElementById('complianceContactForm');f.elements.name.value=window.testMarker;f.elements.category.value='Layanan darurat';f.elements.phone.value='+62 21 555 0100';f.requestSubmit();}");
 await wait("!document.getElementById('complianceContactModal').open&&document.getElementById('complianceContactBody').textContent.includes(window.testMarker)");
 assert.ok(await evaluate("[...document.querySelectorAll('#complianceContactBody a')].some(a=>a.getAttribute('href')==='tel:+62215550100')"));
 await evaluate("document.querySelector('[data-view=office-design]').click()");
 await wait("!document.getElementById('odNew').disabled");
 await evaluate("document.getElementById('odNew').click()");
 await wait("!document.getElementById('odTemplate').disabled");
 await evaluate("document.getElementById('odTemplate').click();document.getElementById('odSettings').click();{const f=document.getElementById('odSettingsForm');f.elements.name.value=window.testMarker;f.requestSubmit();}");
 assert.ok(await evaluate("document.querySelectorAll('#odCanvas [data-od-node]').length>30"));
 // Move the sofa using real pointer input, then use Undo and Redo.
 await evaluate("document.querySelector('#odCanvas [fill=\"#f8cf75\"]').scrollIntoView({block:'center'})");
 const sofa=await evaluate("(()=>{const r=document.querySelector('#odCanvas [fill=\"#f8cf75\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',...sofa,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:sofa.x+30,y:sofa.y+30,button:'left',buttons:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:sofa.x+30,y:sofa.y+30,button:'left',clickCount:1});
 const movedX=Number(await evaluate("document.getElementById('odProperties').elements.x.value"));assert.ok(movedX>50);
 await evaluate("document.getElementById('odUndo').click();document.getElementById('odRedo').click();document.getElementById('odSave').click()");
 await wait("document.getElementById('odStatus').textContent==='Denah berhasil disimpan.'&&document.getElementById('odLayouts').value!==''&&!document.getElementById('odReload').disabled");
 const savedId=await evaluate("document.getElementById('odLayouts').value");assert.ok(savedId);
 const saved=await evaluate("fetch('/api/office-design/'+document.getElementById('odLayouts').value).then(r=>r.json())");
 assert.equal(saved.name,marker);assert.equal(saved.layout.nodes.find(n=>n.type==='sofa').x,movedX);
 await evaluate("document.getElementById('odReload').click()");await wait("document.getElementById('odStatus').textContent==='Denah dimuat.'");
 // New canvas saves pending edits first; a failed save must retain the old canvas.
 await evaluate("document.querySelector('[data-od-add=chair]').click()");
 const pendingNodes=await evaluate("document.querySelectorAll('#odCanvas [data-od-node]').length");
 await evaluate("window.canvasOriginalFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/office-design/')&&options?.method==='PUT'?Promise.resolve(new Response(JSON.stringify({error:'Test canvas save failure'}),{status:500,headers:{'Content-Type':'application/json'}})):window.canvasOriginalFetch(url,options);document.getElementById('odNew').click()");
 await wait("document.getElementById('odStatus').textContent==='Test canvas save failure'&&!document.getElementById('odNew').disabled");
 assert.equal(await evaluate("document.getElementById('odLayouts').value"),savedId);
 assert.equal(await evaluate("document.querySelectorAll('#odCanvas [data-od-node]').length"),pendingNodes);
 await evaluate("window.fetch=window.canvasOriginalFetch;document.getElementById('odNew').click()");
 await wait("document.getElementById('odLayouts').value===''&&!document.getElementById('odSave').disabled");
 assert.equal(await evaluate("document.querySelectorAll('#odCanvas [data-od-node]').length"),0);
 assert.equal((await evaluate("fetch('/api/office-design/'+"+JSON.stringify(savedId)+").then(r=>r.json())")).layout.nodes.length,pendingNodes);
 await evaluate("document.getElementById('odSettings').click();{const f=document.getElementById('odSettingsForm');f.elements.name.value=window.testMarker+'-new';f.requestSubmit();}document.getElementById('odSave').click()");
 await wait("document.getElementById('odLayouts').value!==''&&!document.getElementById('odNew').disabled");
 assert.notEqual(await evaluate("document.getElementById('odLayouts').value"),savedId);
 await evaluate("document.getElementById('odLayouts').value="+JSON.stringify(savedId)+";document.getElementById('odLayouts').dispatchEvent(new Event('change'))");
 await wait("document.getElementById('odStatus').textContent==='Denah dimuat.'");
 assert.equal(await evaluate("document.querySelectorAll('#odCanvas [data-od-node]').length"),pendingNodes);
 console.log('PASS: new blank canvas saves pending changes, preserves previous canvas, and retains edits after a failed save.');
 await evaluate("window.scrollTo(0,0)");
 const shot=await call('Page.captureScreenshot',{format:'png'});fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/office-design-preview.png',Buffer.from(shot.data,'base64'));
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"),'Mobile page avoids horizontal overflow');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 // Frameworks still load when entered, and CSF navigation reuses its initial request.
 await evaluate("document.querySelector('[data-view=csf]').click();ensureModuleData('csf')");
 assert.equal(await evaluate('csfRows.length>0'),true);
 const csfRequests=requests.filter(url=>new URL(url).pathname==='/api/csf').length;
 await evaluate("document.querySelector('[data-view=csf-manage]').click();ensureModuleData('csf-manage')");
 assert.equal(requests.filter(url=>new URL(url).pathname==='/api/csf').length,csfRequests);
 assert.equal(requests.some(url=>new URL(url).pathname==='/api/privacy'),false);
 await evaluate("document.querySelector('[data-view=privacy]').click();ensureModuleData('privacy')");
 assert.equal(await evaluate('privacyRows.length>0'),true);
 console.log('PASS: framework entry loads data on demand and reuses CSF data across views.');
 // A viewer must not write through the APIs or see editable controls.
 let viewer=(await pool.query("SELECT username FROM app_users WHERE role='viewer' LIMIT 1")).rows[0];
 if(!viewer) viewer=await require('../src/services/accountService').createUser({username:marker,password:require('node:crypto').randomBytes(24).toString('hex')+'Aa1!',role:'viewer'});
 const viewerToken=auth.createSession({username:viewer.username,role:'viewer'});
 await call('Network.setCookie',{name:auth.sessionCookie,value:viewerToken,url:base,httpOnly:true});
 await call('Page.reload');await wait("document.documentElement.dataset.frontend==='vue'&&document.getElementById('currentUser').textContent==='view'");
 await evaluate("document.querySelector('[data-view=office-design]').click()");
 await wait("document.getElementById('odNew').hidden");
 for(const endpoint of ['/api/office-design','/api/compliance/reports','/api/compliance/contacts']) assert.equal(await evaluate("fetch("+JSON.stringify(endpoint)+",{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)"),403);
 await evaluate("document.querySelector('[data-view=reporting-regulator]').click();document.getElementById('crSmtpTab').click()");
 assert.equal(await evaluate("document.getElementById('crSmtpAdmin').hidden"),true);
 assert.equal(await evaluate("fetch('/api/smtp-settings/accounts').then(r=>r.status)"),403);
 auth.destroySession(viewerToken);
 assert.deepEqual(errors,[]);
 console.log('PASS: reminder 404 recovery re-enables recipient selection; completed reporting evidence upload/download; paged owner mappings retain all pages; global reminder form submits all mappings; reporting create/update/continuous reminder, SMTP tab create/update/secret preservation/admin access, contact create/call link, office example/drag/undo/redo/save/reload, mobile bounds, viewer authorization.');
 auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.query("DELETE FROM compliance_reports WHERE data->>'title'=$1",[marker]);await pool.query("DELETE FROM compliance_contacts WHERE data->>'name'=$1",[marker]);await pool.query('DELETE FROM office_designs WHERE name=ANY($1::text[])',[[marker,marker+'-new']]);await pool.query("DELETE FROM app_smtp_accounts WHERE settings->>'name'=$1",[marker]);await pool.query('DELETE FROM app_users WHERE username=$1',[marker]);await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-compliance-office-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
