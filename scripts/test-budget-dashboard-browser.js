const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {parse,compileScript}=require('@vue/compiler-sfc');
const express=require('express');
const source=fs.readFileSync('frontend/client/src/workspace/components/BudgetCharts.vue','utf8');
const descriptor=parse(source).descriptor;
const component=compileScript(descriptor,{id:'budget-preview',inlineTemplate:true}).content.replaceAll('from "vue"','from "/vue.js"').replaceAll("from 'vue'","from '/vue.js'").replace('export default','const component =');
const fixture=[{title:'Server',department:'IT',type:'CAPEX',amount:1000,actual:800,status:'completed'},{title:'Cloud',department:'IT',type:'OPEX',amount:500,actual:0,status:'submitted'},{title:'Training',department:'SDM',type:'OPEX',amount:500,actual:0,status:'approved'}];
const styles=['frontend/public/styles.css','frontend/public/modern.css','frontend/public/tailwind.css','frontend/public/legacy-before-tailwind.css','frontend/public/legacy-after-tailwind.css','frontend/client/src/styles/workspace-theme.css'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+descriptor.styles[0].content;
const app=express();
app.get('/vue.js',(req,res)=>res.type('js').send(fs.readFileSync('node_modules/vue/dist/vue.esm-browser.prod.js')));
app.get('/component.js',(req,res)=>res.type('js').send(`import * as Harness from '/vue.js';\n${component}\nconst state=Harness.reactive({rows:${JSON.stringify(fixture)}});window.setRows=rows=>state.rows=rows;Harness.createApp({render(){return Harness.h(component,{rows:state.rows,year:2026,onFilter:value=>window.lastFilter=value});}}).mount('#app');`));
app.get('/',(req,res)=>res.send(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style><body class="workspace-ui"><main style="max-width:1400px;margin:auto;padding:24px"><div id="app"></div></main><script type="module" src="/component.js"></script></body></html>`));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const debugPort=10000+Math.floor(Math.random()*500),profile=path.join(os.tmpdir(),'nist-budget-charts-'+Date.now());
 const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+debugPort,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});let ws;
 try{
  for(let i=0;i<80;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
  if(!ws)throw Error('Chrome did not start');await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m);pending.delete(m.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Browser wait failed: '+expression);};
  await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await waitFor("document.querySelectorAll('.ba-panel').length===4");
  assert.equal(await evaluate("document.querySelectorAll('.ba-donut').length"),2);
  assert.equal(await evaluate("document.querySelector('progress').value"),800);
  assert.equal(await evaluate("document.querySelector('progress').max"),1500);
  assert.equal(await evaluate("document.querySelectorAll('.ba-bar-row').length"),6);
  assert.ok(await evaluate("document.querySelector('.ba-kpis').textContent.includes('53%')"));
  await evaluate("document.querySelector('.ba-legend button').click()");assert.deepEqual(await evaluate('window.lastFilter'),{type:'CAPEX'});
  await evaluate("document.querySelectorAll('.ba-legend')[1].querySelectorAll('button')[1].click()");assert.deepEqual(await evaluate('window.lastFilter'),{status:'submitted'});
  await evaluate("document.querySelector('.ba-department').click()");assert.deepEqual(await evaluate('window.lastFilter'),{department:'IT'});
  await evaluate("document.querySelector('.ba-kpi-button').click()");assert.deepEqual(await evaluate('window.lastFilter'),{pending:true});
  for(const width of [1440,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});await delay(100);assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),`No overflow at ${width}px`);}
  await evaluate('setRows([])');await waitFor("document.querySelector('progress').value===0");assert.ok(await evaluate("!document.querySelector('.budget-analytics').innerHTML.match(/NaN|Infinity/)&&document.querySelector('.budget-analytics').textContent.includes('Belum ada pengajuan')"));
  console.log('PASS: budget chart totals, absorption, drill-down, desktop/mobile layout and empty state (synthetic data).');
 }finally{ws?.close();chrome.kill();await new Promise(r=>server.close(r));const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-budget-charts-'))try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}
})().catch(e=>{console.error(e);process.exitCode=1;});
