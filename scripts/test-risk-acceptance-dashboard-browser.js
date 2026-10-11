const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Cdp } = require('./test-threat-modelling-browser');
const { pool } = require('../src/config/database');
const { createSession } = require('../src/config/auth');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const schema = `risk_acceptance_dashboard_test_${process.pid}_${Date.now()}`;
  const query = pool.query.bind(pool);
  const profile = path.join(os.tmpdir(), `nist-risk-acceptance-dashboard-browser-${process.pid}-${Date.now()}`);
  let server, chrome, client;
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    for (const table of ['risk_acceptance_forms','audit_events']) {
      await query(`CREATE TABLE "${schema}".${table} (LIKE public.${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
      await query(`CREATE SEQUENCE "${schema}".${table}_test_id`);
      await query(`ALTER TABLE "${schema}".${table} ALTER COLUMN id SET DEFAULT nextval('"${schema}".${table}_test_id')`);
    }
    pool.query = (sql,...args)=>query(sql.replace(/\b(risk_acceptance_forms|audit_events)\b/g,`"${schema}".$1`),...args);
    const admin = (await query("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
    const token = createSession({ username: admin.username, role: 'admin' });
    server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const debugPort = 9800 + Math.floor(Math.random() * 100);
    chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let target;
    for (let i = 0; i < 100; i++) { try { target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await delay(100); } }
    assert.ok(target); client = new Cdp(target.webSocketDebuggerUrl); await client.connect();
    client.socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.method === 'Page.javascriptDialogOpening') client.send('Page.handleJavaScriptDialog', { accept: true }); });
    await client.send('Page.enable'); await client.send('Runtime.enable');
    await client.send('Network.setCookie', { name: 'nist_session', value: token, url: base, httpOnly: true });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: `${base}/app` });
    await client.wait('document.documentElement.dataset.frontend === "vue" && document.querySelector("#riskDropdownManager")');
    console.log('Browser check: workspace mounted');
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const date = days=>new Date(Date.parse(today+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
    const service=require('../src/services/riskAcceptanceService');
    const baseForm={requestorName:'Test requestor',assetName:'Gateway',department:'IT',riskDescription:'TLS legacy configuration',benefitJustification:'Legacy compatibility',mitigationPlan:'Temporary network restriction',businessOwnerDecision:'temporary',cisDecision:'approved',requestorSignature:'Requestor',requestorDate:date(-5),cioName:'Test CIO',cioSignature:'CIO',cioDate:date(-4),cisName:'Test CIS',cisSignature:'CIS',cisDate:date(-3),remediationDate:date(10)};
    const fixtures=[];
    for(const form of [baseForm,{...baseForm,assetName:'Core banking',department:'Finance',cisDecision:'conditional',remediationDate:date(-1)},{...baseForm,assetName:'Cloud',cisSignature:'',remediationDate:date(30)},{...baseForm,cisDecision:'denied'},{...baseForm,remediationDate:''},{...baseForm,remediationDate:date(40)}]) fixtures.push(await service.create(form));
    const id=String(fixtures[0].id);
    await query(`INSERT INTO "${schema}".audit_events(request_id,actor_username,actor_role,event_type,method,path,status_code,ip_address,details) VALUES ('fixture-audit','test-admin','admin','data.create','POST','/api/risk-acceptance',201,'127.0.0.1',$1)`,[JSON.stringify({response:{id},submitted:{cisDecision:'approved'}})]);
    await client.evaluate('document.querySelector("[data-view=risk-acceptance]").click();document.querySelector("#raRefresh").click()');
    await client.wait('document.querySelector("#raResultCount").textContent === "(6)"');
    console.log('Browser check: fixtures and dashboard loaded');
    assert.equal(await client.evaluate('document.querySelectorAll("#riskAcceptanceView table").length'),1);
    assert.equal(await client.evaluate('document.querySelectorAll("#riskAcceptanceDashboardPanel table").length'),0);
    for(const [kind,count] of [['active','2'],['soon','1'],['pending','1'],['overdue','1'],['missing','1']]) assert.equal(await client.evaluate(`document.querySelector('[data-ra-kpi="${kind}"] strong').textContent`),count);
    await client.evaluate('document.querySelector("[data-ra-kpi=overdue]").click()');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'),'(1)');
    assert.ok(await client.evaluate('document.querySelector("#riskAcceptanceBody").textContent.includes("Core banking")'));
    assert.equal(await client.evaluate('document.querySelector("#riskAcceptanceListTab").getAttribute("aria-selected")'), 'true');
    await client.evaluate('document.querySelector("#raBackDashboard").click()');
    assert.equal(await client.evaluate('document.querySelector("#riskAcceptanceDashboardPanel").hidden'), false);
    await client.evaluate('document.querySelector("#raReset").click();document.querySelector("#raAsset").value="Gateway";document.querySelector("#raAsset").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'),'(4)');
    await client.evaluate('document.querySelector("#raDepartment").value="Finance";document.querySelector("#raDepartment").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'),'(0)');
    await client.evaluate('document.querySelector("#raReset").click()');
    await client.evaluate(`document.querySelector('#raMonth').value='${date(10).slice(0,7)}';document.querySelector('#raMonth').dispatchEvent(new Event('change',{bubbles:true}));Array.from(document.querySelectorAll('[data-ra-date]')).find(b=>b.dataset.raDate==='${date(10)}').click()`);
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'),'(1)');
    await client.evaluate(`document.querySelector('[data-ra-view="${id}"]').click()`);
    assert.ok(await client.evaluate('document.querySelector("#riskAcceptanceModal").open && document.querySelector("#riskAssetName").disabled'));
    await client.evaluate('document.querySelector("#riskAcceptanceCancel").click()');
    await client.evaluate(`document.querySelector('[data-ra-audit="${id}"]').click()`);
    await client.wait('document.querySelector("#raAuditBody").textContent.includes("fixture-audit")');
    assert.ok(await client.evaluate('document.querySelector("#raAuditBody").textContent.includes("127.0.0.1")'));
    await client.evaluate('document.querySelector("#raAuditClose").click()');
    console.log('Browser check: filters, calendar, details and audit verified');
    const pdf=await client.evaluate(`fetch('/api/risk-acceptance/${id}/export/pdf').then(async r=>({status:r.status,type:r.headers.get('content-type'),bytes:(await r.arrayBuffer()).byteLength}))`);
    assert.equal(pdf.status,200);assert.match(pdf.type,/pdf/);assert.ok(pdf.bytes>1000);
    await client.evaluate('document.querySelector("#raReset").click();document.querySelector("#raAlertsButton").click()');
    assert.equal(await client.evaluate('document.querySelectorAll("#raAlerts [data-ra-view]").length'),2);
    await client.evaluate('document.querySelector("#raAlertsButton").click();document.querySelector("#riskAcceptanceNew").click()');
    await client.evaluate(`(()=>{for(const field of ['riskRequestorName','riskAssetName','riskDepartment','riskDescription','riskBenefitJustification','riskMitigationPlan'])document.getElementById(field).value='New acceptance fixture';document.getElementById('riskDescription').value='<img src=x onerror=alert(1)> fixture';document.querySelector('#riskAcceptanceForm').requestSubmit()})()`);
    await client.wait('!document.querySelector("#riskAcceptanceModal").open && document.querySelector("#raResultCount").textContent === "(7)"');
    console.log('Browser check: guarded create saved');
    assert.equal(await client.evaluate('document.querySelector("[data-ra-kpi=pending] strong").textContent'),'2');
    assert.equal(await client.evaluate('document.querySelectorAll("#riskAcceptanceBody img").length'),0);
    await client.evaluate(`document.querySelector('[data-ra-edit="${id}"]').click();document.querySelector('#riskCisDecision').value='conditional';document.querySelector('#riskAcceptanceForm').requestSubmit()`);
    await client.wait('!document.querySelector("#riskAcceptanceModal").open && document.querySelector("#riskAcceptanceBody").textContent.includes("Approved with conditions")');
    await client.evaluate('document.querySelector("#raStatus").value="conditional";document.querySelector("#raStatus").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'),'(2)');
    await client.evaluate('document.querySelector("#raReset").click()');
    console.log('Browser check: form update and status filters verified');
    await client.evaluate('document.querySelector("#riskAcceptanceListTab").click();document.querySelector("#raSearch").value="Core banking";document.querySelector("#raSearch").dispatchEvent(new Event("input",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'), '(1)');
    await client.evaluate('document.querySelector("#raListReset").click()');
    assert.equal(await client.evaluate('document.querySelector("#raResultCount").textContent'), '(7)');
    for(const width of [1440,768,390]) {
      await client.evaluate('document.querySelector("#riskAcceptanceListTab").click()');
      await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await delay(200);
      assert.equal(await client.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,`List overflow at ${width}`);
      await client.evaluate('document.querySelector("#raBackDashboard").click()');
      assert.equal(await client.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,`Dashboard overflow at ${width}`);
      assert.equal(await client.evaluate('document.querySelector("#riskAcceptanceDashboardPanel").getBoundingClientRect().right<=document.documentElement.clientWidth+1'),true,`Dashboard clipped at ${width}`);
      assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#raKpis button")).every(b=>b.getBoundingClientRect().right<=document.documentElement.clientWidth+1)'),true,`KPI clipped at ${width}`);
    }
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await client.evaluate('document.querySelector("#raMonth").value=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit"}).format(new Date());document.querySelector("#raMonth").dispatchEvent(new Event("change",{bubbles:true}));window.scrollTo(0,0)');
    const screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('output/risk-acceptance-dashboard-preview.png',Buffer.from(screenshot.data,'base64'));
    assert.deepEqual(client.errors,[]);
    console.log(JSON.stringify({status:'passed',singleList:true,listNavigation:true,search:true,kpis:true,filters:true,calendar:true,drillDown:true,details:true,auditLog:true,pdf:true,create:true,update:true,escapedContent:true,viewports:[1440,768,390]}));
  } finally {
    client?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = query; await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('nist-risk-acceptance-dashboard-browser-')) { await delay(1000); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
