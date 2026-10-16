// Real built editors with in-browser API fixtures; never writes user diagrams.
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database'),auth=require('../src/config/auth');
const {Cdp}=require('./test-threat-modelling-browser');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 let server,chrome,client,token;
 const profile=path.join(os.tmpdir(),'nist-canvas-editors-'+Date.now());
 try{
  const user=(await pool.query("SELECT username,role FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);
  token=auth.createSession(user);server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port,port=10100+Math.floor(Math.random()*200);
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await delay(100);}
  client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
  await client.send('Emulation.setDeviceMetricsOverride',{width:1500,height:1100,deviceScaleFactor:1,mobile:false});
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.setItem('nist-maturity-ui',JSON.stringify({view:'framework'}));window.confirm=()=>true;
   window.canvasFixtures={office:[],threat:[],diagram:{nodes:[{id:'11111111-1111-4111-8111-111111111111',x:60,y:60,width:190,height:58}],version:0}};
   const nativeFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),p=url.pathname,m=options.method||'GET',f=window.canvasFixtures;
    const ok=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
    if(p==='/api/office-design'||p.startsWith('/api/office-design/')){
     if(m==='GET')return ok(p==='/api/office-design'?f.office:f.office.find(r=>r.id===p.split('/').pop()));
     const body=JSON.parse(options.body);body.id=body.id||'office-fixture';body.version=(body.version||0)+1;f.office=[body];return ok(body);
    }
    if(p==='/api/threat-modelling'||p.startsWith('/api/threat-modelling/')){
     if(m==='GET')return ok(f.threat);const body=JSON.parse(options.body);if(m==='PUT'&&body.version!==f.threat[0]?.version)return new Response(JSON.stringify({error:'Stale version'}),{status:409});body.id=body.id||'threat-fixture';body.version=(f.threat[0]?.version||0)+1;f.threat=[body];return ok(body);
    }
    if(p.startsWith('/api/asset-management/')){
     const route=p.replace('/api/asset-management/','');
     if(route==='catalog')return ok([{id:'11111111-1111-4111-8111-111111111111',tag:'TEST-1',name:'Canvas fixture',type:'Server',status:'in-use'}]);
     if(route==='relations')return ok([]);if(route==='canvases')return ok([{id:'main',name:'Kanvas utama'}]);
     if(route==='diagram'){if(m==='PUT')f.diagram={...JSON.parse(options.body),version:f.diagram.version+1};return ok(f.diagram);}
    }
    return nativeFetch(input,options);
   };
  `});
  await client.send('Page.navigate',{url:base+'/app'});await client.wait("document.documentElement.dataset.frontend==='vue'&&document.getElementById('currentUser').textContent==='admin'");
  const run=expression=>client.evaluate(expression),wait=expression=>client.wait(expression);
  const key=async(key,options={})=>{await run(`document.activeElement?.blur();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,...${JSON.stringify(options)}}))`);await delay(50);};
  const resize=async (selector,dx=80,dy=40)=>{
   const box=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...box});
   await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:box.x+dx,y:box.y+dy});
   await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:box.x+dx,y:box.y+dy});await delay(100);
  };
  await run("document.querySelector('[data-view=office-design]').click()");await wait("!document.getElementById('odNew').disabled");
  await run("document.getElementById('odNew').click()");await wait("!document.getElementById('odSave').disabled");
  await run("document.querySelector('[data-od-add=cctv]').click()");
  await wait("document.querySelector('[data-od-coverage]')");
  await resize('[data-od-resize]');
  const officeWidth=await run("Number(document.getElementById('odProperties').elements.width.value)");assert.ok(officeWidth>45);
  await key('z',{ctrlKey:true});await key('y',{ctrlKey:true});
  assert.equal(await run("Number(document.getElementById('odProperties').elements.width.value)"),officeWidth);
  await key('s',{ctrlKey:true});await wait('canvasFixtures.office.length===1');
  assert.equal(await run('canvasFixtures.office[0].layout.nodes[0].width'),officeWidth);
  assert.equal(await run('canvasFixtures.office[0].layout.nodes[0].coverageRange'),5);
  await key('z',{ctrlKey:true});await key('s',{ctrlKey:true});await wait('canvasFixtures.office[0].version===2');
  assert.equal(await run('canvasFixtures.office[0].id'),'office-fixture');
  assert.equal(await run('canvasFixtures.office[0].layout.nodes[0].width'),45);
  await resize('#odCanvas [data-od-node]',0,0);
  await run("document.getElementById('odProperties').elements.label.focus();document.getElementById('odProperties').elements.label.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))");
  assert.equal(await run("document.querySelectorAll('#odCanvas [data-od-node]').length"),1);
  console.log('PASS: Office security objects, resize, undo/redo, save and native text editing.');
  await run("document.querySelector('[data-view=asset-modelling]').click()");await wait("document.querySelector('[data-diagram-asset]')");
  await run("document.querySelector('[data-diagram-asset]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  await resize('[data-asset-resize]');
  const assetWidth=await run("Number(document.querySelector('[data-diagram-asset] rect').getAttribute('width'))");assert.ok(assetWidth>190);
  await key('z',{ctrlKey:true});assert.equal(await run("Number(document.querySelector('[data-diagram-asset] rect').getAttribute('width'))"),190);
  await key('y',{ctrlKey:true});await key('s',{ctrlKey:true});await wait('canvasFixtures.diagram.version===1');
  assert.equal(await run('canvasFixtures.diagram.nodes[0].width'),assetWidth);
  await key('Delete');assert.equal(await run("document.querySelectorAll('[data-diagram-asset]').length"),0);
  await key('z',{ctrlKey:true});assert.equal(await run("document.querySelectorAll('[data-diagram-asset]').length"),1);
  console.log('PASS: Asset node resize and dimensions persist; undo/redo and safe canvas-only deletion.');
  await run("document.querySelector('[data-view=threat-modelling]').click()");
  await wait("!document.querySelector('#threatModellingView .tm-palette button').disabled");
  await run("document.querySelector('#threatModellingView .tm-palette button').click()");
  await wait("document.querySelector('.tm-node [data-editor-only]')");
  const threatOriginalWidth=await run("Number(document.querySelector('.tm-node [data-editor-only]').getAttribute('x'))+6");
  await resize('.tm-node [data-editor-only]');
  const threatWidth=await run("Number(document.querySelector('.tm-node [data-editor-only]').getAttribute('x'))+6");assert.ok(threatWidth>threatOriginalWidth);
  await key('d',{ctrlKey:true});assert.equal(await run("document.querySelectorAll('.tm-node').length"),2);
  await key('z',{metaKey:true});assert.equal(await run("document.querySelectorAll('.tm-node').length"),1);
  await key('y',{ctrlKey:true});assert.equal(await run("document.querySelectorAll('.tm-node').length"),2);
  await key('s',{ctrlKey:true});await wait('canvasFixtures.threat.length===1');
  assert.equal(await run('canvasFixtures.threat[0].diagram.nodes[0].width'),threatWidth);
  await key('z',{ctrlKey:true});await key('s',{ctrlKey:true});await wait('canvasFixtures.threat[0].version===2');
  assert.equal(await run('canvasFixtures.threat[0].diagram.nodes.length'),1);
  assert.equal(await run('canvasFixtures.threat[0].id'),'threat-fixture');
  // Check the visible viewport, not only SVG state: a narrow or displaced canvas
  // can pass all editing assertions while still being unusable.
  await run("document.documentElement.dataset.theme='dark'");
  for(const width of [1500,1024,768,390]){
   await client.send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
   for(const [view,selector] of [['asset-modelling','.asset-graph'],['threat-modelling','.tm-viewport'],['office-design','#odViewport']]){
    await run(`document.querySelector('[data-view=${view}]').click()`);await delay(300);
    const bounds=await run(`(()=>{const e=document.querySelector('${selector}'),r=e.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,right:r.right};})()`);
    assert.ok(bounds.width>=Math.min(280,width-140),`${view} at ${width}px has unusable canvas width: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.height>=250,`${view} at ${width}px has unusable canvas height`);
    assert.ok(bounds.x>=0&&bounds.right<=width+1,`${view} canvas extends outside screen at ${width}px: ${JSON.stringify(bounds)}`);
    if(width===1500){
     await run(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
     const shot=await client.send('Page.captureScreenshot',{format:'png'});
     await fs.mkdir(path.join(__dirname,'../output'),{recursive:true});
     await fs.writeFile(path.join(__dirname,`../output/canvas-fixed-${view}.png`),Buffer.from(shot.data,'base64'));
    }
    if(view==='asset-modelling'&&width===1500){
     assert.equal(await run("(()=>{const p=document.querySelector('.asset-diagram-palette').getBoundingClientRect(),c=document.querySelector('.asset-graph').getBoundingClientRect();return Math.abs(p.top-c.top)<2&&c.left>p.left;})()"),true,'Asset canvas must sit beside catalog');
    }
   }
  }
  console.log('PASS: All three canvas viewports remain usable at desktop, tablet and mobile widths.');
  assert.deepEqual(client.errors,[]);console.log('PASS: Threat resize, duplicate, Mac undo, redo and save; no browser exceptions.');
 }finally{
  client?.socket.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(token)auth.destroySession(token);await pool.end();
  try{await fs.rm(profile,{recursive:true,force:true});}catch{}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
