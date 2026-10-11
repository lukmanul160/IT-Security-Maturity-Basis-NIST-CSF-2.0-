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
  const schema = `risk_dashboard_test_${process.pid}_${Date.now()}`;
  const query = pool.query.bind(pool);
  const profile = path.join(os.tmpdir(), `nist-risk-dashboard-browser-${process.pid}-${Date.now()}`);
  let server, chrome, client;
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`CREATE TABLE "${schema}".risk_register (LIKE public.risk_register INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
    await query(`CREATE TABLE "${schema}".risk_dropdown_options (id BIGSERIAL PRIMARY KEY, field_name TEXT NOT NULL, option_value TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(field_name,option_value))`);
    pool.query = (sql, ...args) => query(sql.replace(/\b(risk_register|risk_dropdown_options)\b/g, `"${schema}".$1`), ...args);
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
    await query(`INSERT INTO "${schema}".risk_register (risk_id,risk_category,effected_asset,device_name,identification_risk,asset_confidentiality,asset_integrity,asset_availability,likelihood,impact,risk_rating,risk_owner,residual_likelihood,residual_impact,residual_rating,treatment_action,deadline) VALUES
      ('TEST-001','Technical','Server','Gateway','Service disruption',5,5,5,5,5,'High','SOC',2,2,'Low','Mitigation','2000-01-01'),
      ('TEST-002','Operational','Laptop','Laptop 1','Lost equipment',2,2,2,2,2,'Low','IT',NULL,NULL,'','Closed','2000-01-01')`);
    await client.evaluate('document.querySelector("[data-view=risk-management]").click(); document.querySelector("[data-risk-tab=dashboard]").click()');
    await client.wait('document.querySelector("#rdResultCount").textContent === "(2)"');
    const dashboard=()=>client.evaluate('document.querySelector("[data-risk-tab=dashboard]").click()');
    const count=()=>client.evaluate('document.querySelector("#rdResultCount").textContent');
    const assertRegister=async expected=>{assert.equal(await count(),`(${expected})`);assert.ok(await client.evaluate('document.querySelector("#riskDashboardPanel").hidden && !document.querySelector("#riskRegisterPanel").hidden && document.querySelector("[data-risk-tab=register]").getAttribute("aria-selected")==="true"'));};
    assert.equal(await client.evaluate('document.querySelectorAll("#riskDashboardPanel table").length'),1,'Dashboard only contains the heatmap table');
    assert.equal(await client.evaluate('document.querySelector("#rdBody")'),null,'No duplicate actionable list');
    assert.equal(await client.evaluate('document.querySelectorAll("[data-rd-cell]").length'),25);
    for(const [key,n] of [['all',2],['active',1],['high',1],['residual',0],['overdue',1],['paired',1]]) {
      await dashboard();await client.evaluate(`document.querySelector('[data-rd-kpi="${key}"]').click()`);await assertRegister(n);
    }
    await dashboard();
    // A drill-down must clear stale local filters, search and pagination.
    await client.evaluate('document.querySelector("#riskRegisterSearch").value="nonexistent";document.querySelector("#riskRegisterTreatmentFilter").value="Closed";Array.from(document.querySelectorAll("[data-rd-cell]")).find(b=>b.dataset.rdCell==="5-5").click()');
    await assertRegister(1);assert.ok(await client.evaluate('document.querySelector("#riskRegisterBody").textContent.includes("TEST-001")'));
    assert.equal(await client.evaluate('document.querySelector("#riskRegisterSearch").value'),'');
    await client.evaluate('document.querySelector("#rdReturnDashboard").click();document.querySelector("#rdMode").value="residual";document.querySelector("#rdMode").dispatchEvent(new Event("change",{bubbles:true}));Array.from(document.querySelectorAll("[data-rd-cell]")).find(b=>b.dataset.rdCell==="2-2").click()');
    await assertRegister(1);
    await client.evaluate('document.querySelector("#riskRegisterBody [data-rd-view]").click()');
    assert.ok(await client.evaluate('document.querySelector("#rdDetail").open && document.querySelector("#rdDetailBody").textContent.includes("SOC")'));
    await client.evaluate('document.querySelector("#rdDetailClose").click();document.querySelector("#riskRegisterBody [data-rm-edit]").click()');
    assert.ok(await client.evaluate('document.querySelector("#riskManagementModal").open && document.querySelector("#riskRegisterOriginalId").value === "TEST-001"'));
    await client.evaluate('document.querySelector("#rmNote").value="Verified register edit";document.querySelector("#riskRegisterForm").requestSubmit()');
    await client.wait('!document.querySelector("#riskManagementModal").open && document.querySelector("#riskRegisterBody").textContent.includes("Verified register edit")');
    console.log('Browser check: single register, KPI/heatmap navigation, details and edit verified');
    await client.evaluate('document.querySelector("#rdClearDrill").click()');assert.equal(await count(),'(2)');
    await dashboard();
    for(const [selector,n] of [['[data-rd-category="Technical"]',1],['[data-rd-category="Operational"]',1],['[data-rd-owner="SOC"]',1],['#rdTrend circle[data-rd-month]',1],['#rdTrend button[data-rd-month]',1]]) {
      await dashboard();await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent("click",{bubbles:true}))`);await assertRegister(n);
    }
    await dashboard();
    await client.evaluate('document.querySelector("#rdTrend circle[data-rd-month]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');await assertRegister(1);
    for(const [key,n] of [['high',1],['overdue',1],['residual',0]]) {
      console.log('Browser check: indicator',key,await client.evaluate('document.querySelector("#rdIndicators").textContent')); 
      await dashboard();await client.evaluate(`document.querySelector('#rdIndicators [data-rd-kpi="${key}"]').click()`);await assertRegister(n);
    }
    await dashboard();await client.evaluate('document.querySelector("#rdReset").click()');
    for(const [id,value] of [['rdScope','a:Server'],['rdOwner','SOC'],['rdCategory','Technical']]) {
      await client.evaluate(`document.querySelector('#${id}').value='${value}';document.querySelector('#${id}').dispatchEvent(new Event('change',{bubbles:true}))`);assert.equal(await count(),'(1)');
    }
    await client.evaluate('document.querySelector("#rdPeriod").value="custom";document.querySelector("#rdPeriod").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#rdStart").value="2100-01-01";document.querySelector("#rdEnd").value="2000-01-01";document.querySelector("#rdStart").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await count(),'(0)');assert.equal(await client.evaluate('document.querySelector("#rdStartLabel").hidden'),false);
    await client.evaluate('document.querySelector("#rdReset").click();document.querySelector("#rdAlertsButton").click()');
    assert.equal(await client.evaluate('document.querySelector("#rdAlerts").hidden'),false);assert.equal(await client.evaluate('document.querySelectorAll("#rdAlerts [data-rd-view]").length'),1);
    await client.evaluate('document.querySelector("#rdAlerts [data-rd-view]").click()');assert.equal(await client.evaluate('document.querySelector("#rdDetail").open'),true);
    await client.evaluate('document.querySelector("#rdDetailClose").click();document.querySelector("#rdAlertsButton").click();document.querySelector("[data-rd-kpi=high]").click()');
    // Capture actual download payloads from both dashboard and register export controls.
    await client.evaluate(`window.__riskDownloads=[];HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(async r=>{const blob=await r.blob();window.__riskDownloads.push({name,bytes:blob.size,text:name.endsWith('.json')?await blob.text():''})})}`);
    await client.evaluate('document.querySelector("#riskRegisterExportButton").click()');await client.wait('window.__riskDownloads.length===1');
    assert.equal((await client.evaluate('JSON.parse(window.__riskDownloads[0].text).riskRegister')).length,1);
    await dashboard();
    for(const format of ['pdf','xlsx','json']) {
      const before=await client.evaluate('window.__riskDownloads.length');
      await client.evaluate(`document.querySelector('#rdExport').value='${format}';document.querySelector('#rdExport').dispatchEvent(new Event('change',{bubbles:true}))`);
      await client.wait(`window.__riskDownloads.length===${before+1}`);
      const payload=await client.evaluate(`window.__riskDownloads[${before}]`);assert.ok(payload.bytes>100);
      if(format==='json')assert.equal(JSON.parse(payload.text).riskRegister.length,1);
    }
    console.log('Browser check: charts, indicators, filters, alerts and filtered exports verified');
    await client.evaluate('document.querySelector("[data-risk-tab=register]").click();document.querySelector("#riskRegisterClearFilters").click();document.querySelector("#riskRegisterCategoryFilter").value="Operational";document.querySelector("#riskRegisterCategoryFilter").dispatchEvent(new Event("change"))');
    assert.equal(await count(),'(1)');await client.evaluate('document.querySelector("#riskRegisterSearch").value="TEST-001";document.querySelector("#riskRegisterSearch").dispatchEvent(new Event("input"))');assert.equal(await count(),'(0)');
    await client.evaluate('document.querySelector("#riskRegisterClearFilters").click()');assert.equal(await count(),'(2)');
    await client.evaluate('document.querySelector("[data-rm-sort=riskId]").click()');assert.equal(await client.evaluate('document.querySelector("#riskRegisterBody [data-rd-view]").dataset.rdView'),'TEST-001');
    await client.evaluate('document.querySelector("[data-rm-sort=riskId]").click()');assert.equal(await client.evaluate('document.querySelector("#riskRegisterBody [data-rd-view]").dataset.rdView'),'TEST-002');
    await query(`INSERT INTO "${schema}".risk_register(risk_id,risk_category,effected_asset,device_name,identification_risk,likelihood,impact,risk_rating,treatment_action) SELECT 'EXTRA-'||LPAD(n::text,3,'0'),'Operational','Laptop','Laptop 1','Pagination fixture',1,1,'Low','Closed' FROM generate_series(1,23) n`);
    await dashboard();await client.evaluate('document.querySelector("#rdRefresh").click()');await client.wait('document.querySelector("#rdResultCount").textContent === "(25)"');
    await client.evaluate('document.querySelector("[data-rd-kpi=all]").click()');await assertRegister(25);
    assert.equal(await client.evaluate('document.querySelectorAll("#riskRegisterBody tr").length'),20);
    await client.evaluate('Array.from(document.querySelectorAll("[data-risk-register-page]")).find(b=>b.dataset.riskRegisterPage==="2").click()');assert.equal(await client.evaluate('document.querySelectorAll("#riskRegisterBody tr").length'),5);
    await dashboard();await client.evaluate('document.querySelector("[data-rd-kpi=high]").click()');await assertRegister(1);
    assert.equal(await client.evaluate('document.querySelector("#riskRegisterPagination").textContent'),'');
    await query(`DELETE FROM "${schema}".risk_register WHERE risk_id LIKE 'EXTRA-%'`);
    await dashboard();await client.evaluate('document.querySelector("#rdReset").click();document.querySelector("#rdRefresh").click()');await client.wait('document.querySelector("#rdResultCount").textContent === "(2)"');
    for(const width of [1440,768,390]) {
      await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await delay(200);
      assert.equal(await client.evaluate('document.querySelector("#riskDashboardPanel").getBoundingClientRect().right<=document.documentElement.clientWidth+1'),true,`Dashboard clipped at ${width}`);
      assert.equal(await client.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,`Overflow at ${width}`);
      await client.evaluate('document.querySelector("[data-rd-kpi=high]").click()');await assertRegister(1);
      assert.equal(await client.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,`Register overflow at ${width}`);await dashboard();
    }
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await client.evaluate('window.scrollTo(0,0)');
    let screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('output/risk-dashboard-preview.png',Buffer.from(screenshot.data,'base64'));
    await client.evaluate('document.querySelector("[data-rd-kpi=high]").click();window.scrollTo(0,0)');screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('output/risk-register-drilldown-preview.png',Buffer.from(screenshot.data,'base64'));
    assert.deepEqual(client.errors,[]);
    console.log(JSON.stringify({status:'passed',singleRegister:true,kpis:true,heatmap:true,charts:true,keyboard:true,indicators:true,filters:true,drillDown:true,details:true,edit:true,alerts:true,exports:['pdf','xlsx','json'],sorting:true,pagination:true,viewports:[1440,768,390]}));
  } finally {
    client?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = query; await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('nist-risk-dashboard-browser-')) { await delay(1000); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
