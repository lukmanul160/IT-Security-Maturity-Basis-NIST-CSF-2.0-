// Browser fixture only: no application server, accounts, database or operational records.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const express=require('express'),{spawn}=require('node:child_process');
const {Cdp}=require('./test-threat-modelling-browser');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,client;const profile=await fs.mkdtemp(path.join(os.tmpdir(),'nist-status-colors-'));
 try{
 const app=express();
 app.get('/statusColors.mjs',(req,res)=>res.sendFile(path.resolve('frontend/client/src/services/statusColors.mjs')));
 app.get('/status-colors.css',(req,res)=>res.sendFile(path.resolve('frontend/client/src/styles/status-colors.css')));
 app.get('/vue.js',(req,res)=>res.sendFile(path.resolve('node_modules/vue/dist/vue.esm-browser.prod.js')));
 app.get('/',(req,res)=>res.send(`<!doctype html><html><head><link rel="stylesheet" href="/status-colors.css"></head><body>
 <div id="fixture"><table><thead><tr><th>Judul</th><th>Status</th></tr></thead><tbody><tr><td id="title">Open</td><td id="report">Belum dilaporkan</td></tr><tr><td>Proses</td><td id="progress">Dalam proses</td></tr><tr><td>Selesai</td><td id="complete">Sudah dilaporkan</td></tr><tr><td>Custom</td><td id="custom">Menunggu evaluasi khusus</td></tr></tbody></table>
 <table><thead><tr><th rowspan="2">Title</th><th colspan="2">Workflow</th></tr><tr><th>Status</th><th>PIC</th></tr></thead><tbody><tr><td>Risk</td><td id="risk">Closed</td><td id="owner">Open</td></tr></tbody></table>
 <span id="gap" class="gap-status open">Open</span><span id="policy" class="status-badge">Approved</span><span id="riskLevel" class="status-badge high">High</span><span id="late" class="ra-badge ra-rejected">Terlambat 4 hari</span>
 <label>Status<select id="statusInput"><option>Open</option><option>Closed</option></select></label><textarea id="notes">Belum dilaporkan</textarea>
 <div contenteditable="true"><span class="status-badge" id="editorText">Open</span></div>
 <div id="vueFixture"></div><div id="portal"></div></div>
 <script type="module">import {installStatusColors} from '/statusColors.mjs';import {createApp,ref,nextTick} from '/vue.js';const state=ref('Open');createApp({setup:()=>({state}),template:'<table><thead><tr><th>Status</th></tr></thead><tbody><tr><td id="vueStatus">{{state}}</td></tr></tbody></table>'}).mount('#vueFixture');window.changeVue=async value=>{state.value=value;await nextTick();};installStatusColors();window.ready=true;</script></body></html>`));
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const port=11000+Math.floor(Math.random()*500);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await delay(100);}assert.ok(target);
 client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');await client.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 await client.wait('window.ready===true');
 const tone=id=>client.evaluate(`document.getElementById(${JSON.stringify(id)}).dataset.statusTone||null`);
 for(const [id,expected] of Object.entries({report:'danger',progress:'warning',complete:'success',custom:'neutral',risk:'success',gap:'danger',policy:'success',statusInput:'danger',vueStatus:'danger',title:null,owner:null,notes:null,editorText:null,riskLevel:null,late:'danger'}))assert.equal(await tone(id),expected,id);
 assert.equal(await client.evaluate("getComputedStyle(document.getElementById('report')).backgroundColor"),'rgba(0, 0, 0, 0)');
 assert.equal(await client.evaluate("document.querySelectorAll('#report .status-color-badge').length"),1);
 const light=await client.evaluate("getComputedStyle(document.querySelector('#report .status-color-badge')).color");
 await client.evaluate("document.documentElement.dataset.theme='dark'");
 assert.notEqual(await client.evaluate("getComputedStyle(document.querySelector('#report .status-color-badge')).color"),light);
 await client.evaluate("document.getElementById('report').textContent='Sudah dilaporkan';document.getElementById('statusInput').value='Closed';document.getElementById('statusInput').dispatchEvent(new Event('change',{bubbles:true}));window.changeVue('Closed')");
 await client.wait("document.getElementById('report').dataset.statusTone==='success'&&document.getElementById('statusInput').dataset.statusTone==='success'&&document.getElementById('vueStatus').dataset.statusTone==='success'");
 await client.evaluate("document.getElementById('portal').innerHTML='<span class=\\\"status-badge\\\" id=\\\"dynamic\\\">Belum diisi</span>'");
 await client.wait("document.getElementById('dynamic')?.dataset.statusTone==='danger'");
 await client.evaluate("document.getElementById('dynamic').textContent='Complete';window.dispatchEvent(new Event('nist:language-change'))");await client.wait("document.getElementById('dynamic').dataset.statusTone==='success'");
 assert.equal(await client.evaluate("document.getElementById('statusInput').value"),'Closed');
 assert.equal(await client.evaluate("document.getElementById('notes').value"),'Belum dilaporkan');
 await client.wait("document.querySelector('#vueStatus .status-color-badge')?.dataset.statusTone==='success'");
 assert.equal(await client.evaluate("document.querySelectorAll('#vueStatus .status-color-badge .status-color-badge').length"),0);
 assert.deepEqual(client.errors,[]);
 console.log('PASS: status colors, dynamic tables/badges, Vue updates, grouped headers, select changes, translation, dark mode, and preserved forms/editor content.');
 }finally{client?.socket.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-status-colors-'))try{await fs.rm(resolved,{recursive:true,force:true});}catch{}}
})().catch(error=>{console.error(error);process.exitCode=1;});
