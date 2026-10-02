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
  const schema = `risk_options_test_${process.pid}_${Date.now()}`;
  const query = pool.query.bind(pool);
  const profile = path.join(os.tmpdir(), `nist-risk-options-browser-${process.pid}-${Date.now()}`);
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
    await client.evaluate('document.querySelector("[data-view=risk-management]").click(); document.querySelector("[data-risk-tab=options]").click()');
    assert.equal(await client.evaluate('document.querySelector("#riskOptionsPanel").hidden'), false);
    assert.equal(await client.evaluate('document.querySelector("#riskRegisterPanel").hidden'), true);
    assert.equal(await client.evaluate('document.querySelector("#riskDashboardPanel").hidden'), true);
    assert.equal(await client.evaluate('document.querySelector("#riskDropdownManager").parentElement.id'), 'riskOptionsPanel');
    for (const [field, value] of [['effectedAsset', 'Test Asset'], ['riskCategory', 'Test Category'], ['deviceName', 'Test Device']]) {
      await client.evaluate(`(()=>{document.querySelector('#riskDropdownNewButton').click();document.querySelector('#riskDropdownField').value=${JSON.stringify(field)};document.querySelector('#riskDropdownValue').value=${JSON.stringify(value)};document.querySelector('#riskDropdownForm').requestSubmit();})()`);
      await client.wait(`document.querySelector('#riskDropdownForm').hidden && document.querySelector('#riskDropdownManager tbody').textContent.includes(${JSON.stringify(value)})`);
    }
    let rows = await client.evaluate('fetch("/api/risk-management/dropdowns").then(r=>r.json())');
    assert.equal(rows.length, 3); assert.ok(rows.every(row => Number(row.id) > 0));
    const device = rows.find(row => row.fieldName === 'deviceName');
    await client.evaluate(`document.querySelector('[data-dropdown-edit="${device.id}"]').click();document.querySelector('#riskDropdownValue').value='Renamed Device';document.querySelector('#riskDropdownForm').requestSubmit()`);
    await client.wait('document.querySelector("#riskDropdownForm").hidden && document.querySelector("#rmDeviceName").textContent.includes("Renamed Device")');
    await client.evaluate('document.querySelector("#riskManagementNewButton").click()');
    assert.ok(await client.evaluate('document.querySelector("#rmEffectedAsset").textContent.includes("Test Asset") && document.querySelector("#rmRiskCategory").textContent.includes("Test Category")'));
    await client.evaluate('document.querySelector("#riskRegisterCancel").click()');
    // Used values retain their real ID and cannot be deleted or silently renamed.
    await query(`INSERT INTO "${schema}".risk_register (risk_id,risk_category,effected_asset,device_name,identification_risk,likelihood,impact) VALUES ('TEST-001','Test Category','Test Asset','Renamed Device','Test risk',2,2)`);
    await client.evaluate('document.querySelector("[data-view=risk-management]").click()');
    await client.wait('document.querySelector("#riskManagementCount").textContent.includes("1 risk")');
    rows = await client.evaluate('fetch("/api/risk-management/dropdowns").then(r=>r.json())');
    assert.equal(rows.find(row => row.fieldName === 'deviceName').id, device.id);
    await client.evaluate(`document.querySelector('[data-dropdown-delete="${device.id}"]').click()`);
    await client.wait('document.querySelector("#riskDropdownStatus").textContent.includes("sedang digunakan")');
    assert.equal((await client.evaluate('fetch("/api/risk-management/dropdowns").then(r=>r.json())')).length, 3);
    // An unused option can be deleted and disappears from the form dropdown.
    await client.evaluate("document.querySelector('#riskDropdownNewButton').click();document.querySelector('#riskDropdownField').value='deviceName';document.querySelector('#riskDropdownValue').value='Unused Device';document.querySelector('#riskDropdownForm').requestSubmit()");
    await client.wait('document.querySelector("#riskDropdownForm").hidden && document.querySelector("#rmDeviceName").textContent.includes("Unused Device")');
    const extra = (await client.evaluate('fetch("/api/risk-management/dropdowns").then(r=>r.json())')).find(row => row.optionValue === 'Unused Device');
    await client.evaluate(`document.querySelector('[data-dropdown-delete="${extra.id}"]').click()`);
    await client.wait('document.querySelector("#riskDropdownStatus").textContent.includes("berhasil dihapus") && !document.querySelector("#rmDeviceName").textContent.includes("Unused Device")');
    await client.evaluate('document.querySelector("#riskDropdownFilter").value="deviceName";document.querySelector("#riskDropdownFilter").dispatchEvent(new Event("change"))');
    assert.equal(await client.evaluate('document.querySelectorAll("#riskDropdownManager tbody tr").length'), 1);
    await client.evaluate('document.querySelector("[data-risk-tab=dashboard]").click()');
    assert.equal(await client.evaluate('document.querySelector("#riskOptionsPanel").hidden'), true);
    assert.deepEqual(client.errors, []);
    console.log(JSON.stringify({ status: 'passed', dedicatedTab: true, createFields: 3, edit: true, delete: true, usedOptionProtection: true, persistedIds: true, liveFormOptions: true, filter: true }));
  } finally {
    client?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = query; await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('nist-risk-options-browser-')) { await delay(1000); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
