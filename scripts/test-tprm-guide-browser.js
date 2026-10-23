// Real guide components, shared permission mapping and navigation in a browser fixture; no database or operational API.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),express=require('express');
const {spawn}=require('node:child_process'),{Cdp}=require('./test-threat-modelling-browser');const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let server,chrome,client;let apiRequests=0;const profile=await fs.mkdtemp(path.join(os.tmpdir(),'nist-tprm-guide-'));try{
 const read=async name=>(await fs.readFile('frontend/client/src/workspace/components/'+name+'.vue','utf8')).match(/<template>([\s\S]*)<\/template>/)[1].replace(' v-pre','');
 const markup=(await Promise.all(['TprmView','TprmFlowView','TprmTieringView'].map(read))).join('');const sidebar=await read('AppSidebar');
 const navigation=await fs.readFile('frontend/client/src/workspace/features/tprm/navigation-and-questionnaires.js','utf8');const prefix=navigation.slice(0,navigation.indexOf('function showTprmQuestionnaireView'));
 const bindings=navigation.split('\n').filter(line=>line.includes("addEventListener('click', showTprmView)")||line.includes("addEventListener('click', showTprmTieringView)")).join('\n');
 const access=await fs.readFile('frontend/client/src/workspace/features/shared/state-and-access.js','utf8');const accessBody=access.slice(access.indexOf('    const pageMap ='),access.indexOf('const workspaceUserReady'));
 const startup=(await fs.readFile('frontend/client/src/workspace/features/shared/event-bindings.js','utf8')).split('\n').find(line=>line.startsWith('if ([')&&line.includes('uiState.view')&&line.includes('showTprmFlowView'));
 assert.ok(startup);
 const index=await fs.readFile('frontend/public/vue/index.html','utf8');const css=index.match(/href="([^\"]+\.css)"/)[1];
 const app=express();app.use((req,res,next)=>{if(req.path.startsWith('/api/'))apiRequests++;next();});
 app.use('/vue/assets',express.static(path.resolve('frontend/public/vue/assets')));app.use('/fonts',express.static(path.resolve('frontend/public/fonts')));app.get('/i18n.js',(req,res)=>res.sendFile(path.resolve('frontend/public/i18n.js')));
 app.get('/',(req,res)=>res.send(`<!doctype html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"><script src="/i18n.js" defer></script><style>body{margin:0}main.fixture{margin-left:260px;padding:24px;min-width:0}.view{display:none}.view.active-view{display:block}.sidebar{width:240px}@media(max-width:640px){.sidebar{position:relative!important;width:auto!important;height:180px!important;min-height:0!important;overflow:auto}main.fixture{margin-left:0;padding:12px}}</style></head><body>${sidebar}<main class="fixture">${markup}<div class="view" id="tprmRegisterView"></div><button data-tprm-register-tab="register">Register fixture</button><button data-tprm-register-tab="governance">Governance fixture</button></main><script>
 const $=id=>document.getElementById(id);let currentUserRole='viewer',currentUserPermissions=['tprm','tprm-tiering','tprm-register','tprm-questionnaire','questionnaire-templates'];const uiState=JSON.parse(localStorage.getItem('nist-maturity-ui')||'{"view":"tprm"}');const saveUiState=view=>localStorage.setItem('nist-maturity-ui',JSON.stringify({view}));
 ${prefix}
 ${bindings}
 function applyFixtureAccess(){${accessBody}
 document.querySelector('[data-view=tprm-register]').addEventListener('click',()=>{window.lastTarget='tprm-register';});
 document.querySelectorAll('[data-tprm-register-tab]').forEach(button=>button.addEventListener('click',()=>{window.lastTab=button.dataset.tprmRegisterTab;}));
 applyFixtureAccess();${startup}
 window.ready=true;
 </script></body>`));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const port=12500+Math.floor(Math.random()*400);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await delay(100);}assert.ok(target);client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await client.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await client.wait('window.ready===true');
 assert.deepEqual(await client.evaluate("[...document.querySelectorAll('#tprmNav [data-view]')].slice(0,3).map(el=>el.dataset.view)"),['tprm','tprm-flow','tprm-tiering']);
 await client.evaluate("document.querySelector('[data-view=tprm-flow]').click()");assert.equal(await client.evaluate("document.getElementById('tprmFlowView').classList.contains('active-view')"),true);assert.equal(await client.evaluate("document.querySelectorAll('.tprm-guide-steps>li').length"),10);
 await client.evaluate("document.querySelector('[data-tprm-guide-tab=governance]').click()");assert.equal(await client.evaluate('window.lastTab'),'governance');
 await client.evaluate("document.querySelector('[data-view=tprm-flow]').click()");await client.send('Page.reload');await client.wait("window.ready===true&&document.getElementById('tprmFlowView').classList.contains('active-view')");
 await client.evaluate("window.NistI18n.setLanguage('en')");await client.wait("document.querySelector('#tprmFlowView h2').textContent==='TPRM Entry Flow'");
 await client.evaluate("document.querySelector('[data-view=tprm-tiering]').click()");assert.ok((await client.evaluate("document.getElementById('tprmTieringView').textContent")).includes('100-500'));
 await client.evaluate("document.querySelector('[data-view=tprm-flow]').click();document.documentElement.dataset.theme='dark'");await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);
 assert.equal(await client.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true);
 await client.evaluate("currentUserPermissions=['tprm'];applyFixtureAccess()");assert.equal(await client.evaluate("document.querySelector('#tprmFlowView [data-tprm-guide-nav=tprm-register]').disabled"),true);
 await client.evaluate("currentUserPermissions=['tprm-tiering'];applyFixtureAccess();showTprmFlowView()");assert.equal(await client.evaluate("document.getElementById('tprmFlowView').hidden"),true);assert.equal(await client.evaluate("document.querySelector('[data-view=tprm-flow]').disabled"),true);
 assert.equal(apiRequests,0);assert.deepEqual(client.errors,[]);console.log('PASS: sidebar order, 10 steps, assignment shortcuts, persisted guide view, inherited read permissions, bilingual content, mobile/dark layout and no operational API requests.');
 }finally{client?.socket.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-tprm-guide-'))try{await fs.rm(resolved,{recursive:true,force:true});}catch{}}})().catch(error=>{console.error(error);process.exitCode=1;});
