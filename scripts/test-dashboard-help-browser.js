// Verify monitoring in the built workspace using real read-only APIs. No business records are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,chrome,ws;const profile=path.join(os.tmpdir(),'nist-theme-browser-'+Date.now());
 try{
 const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user,'Existing administrator available');
 const warmed=await Promise.all(Array.from({length:8},()=>pool.connect()));warmed.forEach(c=>c.release());
 const auth=require('../src/config/auth'),token=auth.createSession({username:user.username,role:'admin'});
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const port=9800+Math.floor(Math.random()*100);
 chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<60;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
 assert.ok(ws,'Chrome available');await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const waiting=new Map(),errors=[];
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){waiting.get(m.id)(m);waiting.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{waiting.set(++id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+'; errors: '+JSON.stringify(errors)+'; asset status: '+await evaluate("location.href+' '+document.querySelector('#monitoringDashboardView')?.innerText.slice(0,1200)"));};
 await call('Runtime.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:"const loaderObserver=new MutationObserver(()=>{if(document.querySelector('#governanceLoading img[src*=loading-logo]')){window.loadingLogoPresent=true;loaderObserver.disconnect();}});loaderObserver.observe(document,{childList:true,subtree:true});"});await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('nist-maturity-ui',JSON.stringify({view:'knowledge-notes'}));(()=>{const native=window.fetch.bind(window);const queue=[];let active=0;function next(){while(active<3&&queue.length){const job=queue.shift();active++;native(...job.args).then(job.resolve,job.reject).finally(()=>{active--;next();});}}window.fetch=(...args)=>new Promise((resolve,reject)=>{queue.push({args,resolve,reject});next();});})()"});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
 await wait("document.documentElement.dataset.frontend==='vue'&&!!document.querySelector('[data-theme-toggle]')");
 await wait("!document.getElementById('governanceLoading')");



 await evaluate("document.querySelector('[data-view=risk-management]').click()");
 await wait("!!document.querySelector('#rdKpis [data-rd-kpi=all]')");
 const totals=await evaluate(`fetch('/api/risk-management').then(r=>r.json()).then(rows=>{const list=Array.isArray(rows)?rows:rows.riskRegister;const scored=list.filter(row=>row.residualLikelihood>=1&&row.residualImpact>=1);return {total:list.length,inherent:list.reduce((n,r)=>n+r.likelihood*r.impact,0),residual:scored.reduce((n,r)=>n+r.residualLikelihood*r.residualImpact,0),paired:scored.length};})`);
 await wait("document.querySelector('#rdKpis [data-rd-kpi=all] strong').textContent.includes('"+totals.inherent+"')");
 await evaluate("document.querySelector('#rdKpis [data-rd-kpi=all]').parentElement.querySelector('[data-dashboard-help]').click()");
 await wait("document.getElementById('dashboardHelpDialog').open");
 const text=await evaluate("document.getElementById('dashboardHelpText').textContent");
 assert.ok(text.includes('Total inherent = '+totals.inherent));assert.ok(text.includes('Total residual = '+totals.residual));assert.ok(text.includes(totals.paired+' residual lengkap'));assert.ok(text.includes((totals.total-totals.paired)+' residual belum lengkap'));assert.ok(text.includes('bukan Rupiah/USD'));
 assert.equal(await evaluate("document.getElementById('riskDashboardPanel').hidden"),false);
 await evaluate("document.querySelector('[data-close-dashboard-help]').click()");
 await evaluate("document.querySelector('#rdKpis [data-rd-kpi=paired]').parentElement.querySelector('[data-dashboard-help]').click()");
 assert.ok(await evaluate("document.getElementById('dashboardHelpText').textContent.includes('bukan perbandingan periode')"));
 await evaluate("document.querySelector('[data-close-dashboard-help]').click()");
 for(const view of ['policy-register','audit-finding-tracker','asset-dashboard','monitoring-dashboard','tprm-register']){
  await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
  await wait("!!document.querySelector('.active-view [data-dashboard-help]')");
  await evaluate("document.querySelector('.active-view [data-dashboard-help]').click()");
  await wait("document.getElementById('dashboardHelpDialog').open");
  assert.ok(await evaluate("document.getElementById('dashboardHelpText').textContent.includes('Sumber:')"));
  await evaluate("document.querySelector('[data-close-dashboard-help]').click()");
 }
 assert.deepEqual(errors,[]);console.log('PASS: risk totals reconcile with real API records; help covers independent assessment counts, formulas, filters and all governance dashboards without triggering drill-down.');auth.destroySession(token);
 }finally{ws?.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-theme-browser-')){try{await fs.promises.rm(resolved,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
