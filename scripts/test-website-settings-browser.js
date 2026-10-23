// Real settings UI with in-memory settings; never changes the user's configuration.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{Cdp}=require('./test-threat-modelling-browser');
const settings=require('../src/services/websiteSettingsService'),auth=require('../src/config/auth'),{pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,client,token;const profile=path.join(os.tmpdir(),'nist-website-limits-'+Date.now());
 const read=settings.read,save=settings.save;let fixture={...settings.defaults};
 try{
  settings.read=async()=>fixture;
  settings.save=async input=>{fixture={...fixture,...settings.validate(input)};return settings.publicSettings(fixture);};
  const user=(await pool.query("SELECT username,role FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);token=auth.createSession(user);
  server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,port=10300+Math.floor(Math.random()*200);
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await delay(100);}
  client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
  await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await client.send('Page.navigate',{url:base+'/app'});await client.wait("document.getElementById('currentUser')?.textContent==='admin'&&!document.getElementById('governanceLoading')");
  await client.evaluate("document.getElementById('accountButton').click();document.querySelector('[data-account-tab=website]').click()");
  await client.wait("!document.querySelector('#websiteSettingsForm [type=submit]').disabled");
  assert.equal(await client.evaluate("document.getElementById('websiteSettingsForm').elements.uploadMb.value"),'100');
  assert.equal(await client.evaluate("document.getElementById('websiteSettingsForm').elements.documentEditMb.value"),'50');
  await client.evaluate("{const f=document.getElementById('websiteSettingsForm');f.elements.uploadMb.value=2;f.elements.importMb.value=3;f.elements.exportMb.value=4;f.elements.documentEditMb.value=25;f.requestSubmit();}");
  await client.wait("document.querySelector('[data-website-status]').textContent.includes('tersimpan')");
  assert.deepEqual(fixture.fileLimits,{uploadMb:2,importMb:3,exportMb:4,documentEditMb:25});
  assert.equal(await client.evaluate("(()=>{try{window.NistFileLimits.check(5*1048576,'export');return false;}catch(e){return e.message.includes('4 MB');}})()"),true);
  await client.evaluate("document.querySelector('[data-account-tab=profile]').click();document.querySelector('[data-account-tab=website]').click()");
  await client.wait("!document.querySelector('#websiteSettingsForm [type=submit]').disabled");
  assert.equal(await client.evaluate("document.getElementById('websiteSettingsForm').elements.importMb.value"),'3');
  assert.equal(await client.evaluate("document.getElementById('websiteSettingsForm').elements.documentEditMb.value"),'25');
  assert.deepEqual(client.errors,[]);
  console.log('PASS: Website Settings loads default limits, saves all four fields, reloads saved values and updates client export checks without browser errors.');
 }finally{
  settings.read=read;settings.save=save;client?.socket.close();chrome?.kill();if(token)auth.destroySession(token);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();try{await fs.rm(profile,{recursive:true,force:true});}catch{}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
