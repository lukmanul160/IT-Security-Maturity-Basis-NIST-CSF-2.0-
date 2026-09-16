(async()=>{
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});let client;const errors=[];
 try{
  await waitForChrome();const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(baseUrl+'/login'),{method:'PUT'})).json();
  client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Page.enable');await client.send('Runtime.enable');
  client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text));
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=window.fetch.bind(window);window.smtpTestWrites=[];let smtp={host:'smtp.example.com',port:587,security:'starttls',username:'demo',from:'sender@example.com',hasPassword:true,configured:true};let reminder={enabled:false,daysBefore:30,owners:[],subjectTemplate:'Review {{title}}',bodyTemplate:'Halo {{owner}}',smtpConfigured:true};window.fetch=async(url,options={})=>{const path=new URL(url,location.href).pathname;if(path.startsWith('/api/smtp-settings')||path.startsWith('/api/policy-register/reminder-settings')){if(path.endsWith('/test'))throw new Error('Email sending disabled in UI test');if(options.method==='PUT'){const body=JSON.parse(options.body);window.smtpTestWrites.push({path,body});if(path==='/api/smtp-settings')smtp={...smtp,...body};else reminder={...reminder,...body};}return new Response(JSON.stringify(path==='/api/smtp-settings'?smtp:reminder),{status:200,headers:{'Content-Type':'application/json'}})}return original(url,options)}})()`});
  await waitFor(client,'document.querySelector("#loginForm")','login');
  await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit();`);
  await waitFor(client,'document.documentElement.dataset.frontend==="vue"','workspace',30000);await delay(1000);
  await evaluate(client,`document.querySelector('[data-view="policy-register"]').click();document.querySelector('#policySmtpOpen').click()`);
  await waitFor(client,'!document.querySelector("#policySmtpDays").disabled','reminder loaded');
  assert.equal(await evaluate(client,'document.querySelector("#policySmtpPanel #policySmtpHost")===null'),true);
  await evaluate(client,'document.querySelector("#policyOpenGlobalSmtp").click()');
  await waitFor(client,'!document.querySelector("#globalSmtpHost").disabled && document.querySelector("#globalSmtpHost").value === "smtp.example.com"','central settings');
  assert.equal(await evaluate(client,'!document.querySelector("#accountSmtpPanel").hidden && document.querySelector("#accountView").classList.contains("active-view")'),true);
  await evaluate(client,'document.querySelector("#globalSmtpHost").value="new.example.com";document.querySelector("#globalSmtpForm").requestSubmit()');
  await waitFor(client,'window.smtpTestWrites.length===1','SMTP save');
  const smtpWrite=await evaluate(client,'window.smtpTestWrites[0]');assert.equal(smtpWrite.path,'/api/smtp-settings');assert.equal(smtpWrite.body.daysBefore,undefined);assert.equal(smtpWrite.body.owners,undefined);assert.equal(smtpWrite.body.password,'');
  await evaluate(client,'document.querySelector("#globalSmtpPolicyReminder").click()');
  await waitFor(client,'!document.querySelector("#policySmtpDays").disabled','reminder reloaded');
  await evaluate(client,'document.querySelector("#policySmtpDays").value="14";document.querySelector("#policySmtpForm").requestSubmit()');
  await waitFor(client,'window.smtpTestWrites.length===2','reminder save');
  const reminderWrite=await evaluate(client,'window.smtpTestWrites[1]');assert.equal(reminderWrite.path,'/api/policy-register/reminder-settings');assert.equal(reminderWrite.body.daysBefore,14);assert.equal(reminderWrite.body.host,undefined);assert.equal(reminderWrite.body.password,undefined);
  await fs.mkdir('output/smtp-separation',{recursive:true});
  for(const width of [1440,390]){await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});for(const screen of ['reminder','smtp']){if(screen==='smtp')await evaluate(client,'document.querySelector("#policyOpenGlobalSmtp").click()');else await evaluate(client,'document.querySelector("#globalSmtpPolicyReminder").click()');await delay(350);assert.equal(await evaluate(client,'document.documentElement.scrollWidth>innerWidth+1'),false);const shot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile('output/smtp-separation/'+screen+'-'+width+'.png',Buffer.from(shot.data,'base64'));}}
  assert.deepEqual(errors,[]);console.log('PASS: SMTP and reminder navigation, independent save payloads, password preservation, and responsive UI; no email sent.');
 }finally{client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});
