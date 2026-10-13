// Real API transactions and browser UI; all mutable tables use a disposable schema.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pool } = require('../src/config/database');
const { createSession } = require('../src/config/auth');
const { Cdp } = require('./test-threat-modelling-browser');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const schema = `risk_workflow_test_${process.pid}_${Date.now()}`;
  const query = pool.query.bind(pool), connect = pool.connect.bind(pool);
  const profile = path.join(os.tmpdir(), `nist-risk-workflow-${process.pid}-${Date.now()}`);
  const names = /\b(risk_register|risk_dropdown_options|risk_indicators|risk_workflows|risk_workflow_events|risk_acceptance_forms|app_users|audit_events|role_permissions)\b/g;
  const scoped = sql => sql.replace(names, `"${schema}".$1`);
  let server, chrome, cdp;
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    pool.query = (sql, ...args) => query(scoped(sql), ...args);
    pool.connect = callback => {
      if (typeof callback === 'function') return connect(callback);
      return connect().then(client => ({ query: (sql, ...args) => client.query(scoped(sql), ...args), release: () => client.release() }));
    };
    await query(`CREATE TABLE "${schema}".app_users (id BIGSERIAL PRIMARY KEY, username TEXT UNIQUE, full_name TEXT DEFAULT '', role TEXT, password_hash TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await pool.query("INSERT INTO app_users (username,role) VALUES ('wf-author','admin'),('wf-chief','approver'),('wf-reviewer','editor'),('wf-viewer','viewer')");
    await require('../src/services/permissionService').ensureStore();
    await require('../src/services/riskAcceptanceService').ensureStore();
    await require('../src/services/riskManagementService').ensureStore();
    await require('../src/services/auditService').ensureStore();
    server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const actors = { author: { username: 'wf-author', role: 'admin' }, chief: { username: 'wf-chief', role: 'approver' }, reviewer: { username: 'wf-reviewer', role: 'editor' }, viewer: { username: 'wf-viewer', role: 'viewer' } };
    const tokens = Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, createSession(actor)]));
    const api = async (url, body, actor = 'author', method = body ? 'POST' : 'GET') => {
      const response = await fetch(base + '/api/risk-management' + url, { method, headers: { Cookie: `nist_session=${tokens[actor]}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => ({})); return { status: response.status, data };
    };
    const day = require('../src/services/riskWorkflowRules').today();
    const future = new Date(Date.parse(day) + 90 * 86400000).toISOString().slice(0, 10);
    const nextReview = new Date(Date.parse(day) + 30 * 86400000).toISOString().slice(0, 10);
    let result = await api('', { workflowDraft: true, identificationRisk: 'Test draft without scores' });
    assert.equal(result.status, 201, JSON.stringify(result)); const draftId = result.data.riskId;
    assert.equal(result.data.likelihood, null); assert.equal(result.data.riskRating, '');
    assert.equal((await api(`/${encodeURIComponent(draftId)}/workflow/transition`, { version: 0, action: 'assess', reason: 'Incomplete' })).status, 400);
    const risk = { workflowDraft: true, scenarioImpact: true, riskCategory: 'Technical', effectedAsset: 'Service', deviceName: 'Application', identificationRisk: 'Service outage', riskOwner: 'Business', riskCause: 'Unpatched dependency', riskControl: 'Existing backup', riskAnalysis: 'Business service unavailable', likelihood: 4, impact: 5, assetConfidentiality: 2, assetIntegrity: 2, assetAvailability: 2, treatmentAction: 'Mitigation', ownerOfAction: 'IT', riskTreatmentDescription: 'Patch and recovery test', deadline: future };
    result = await api('', risk); assert.equal(result.status, 201); const id = result.data.riskId; const url = `/${encodeURIComponent(id)}/workflow`;
    assert.equal(result.data.impact, 5, 'Scenario impact remains separate from CIA');
    const fields = { threat: 'Outage', vulnerability: 'Missing patches', likelihoodRationale: 'Exposure', impactRationale: 'Business disruption', currentLikelihood: 3, currentImpact: 5, targetLikelihood: 1, targetImpact: 3, toleranceScore: 4, toleranceRationale: 'Test policy', approver: 'wf-chief', reviewer: 'wf-reviewer', progress: 0, reviewDate: nextReview, evidence: '', verificationNotes: '', acceptanceConditions: 'Monthly review', acceptanceReason: 'Temporary exception', acceptanceExpiry: future, closureReason: 'Service retired' };
    result = await api(url, { ...fields, version: 0, stage: 'Closed', approvedBy: 'forged' }, 'author', 'PUT'); assert.equal(result.status, 200, JSON.stringify(result)); let workflow = result.data;
    assert.equal(workflow.stage, 'Draft'); assert.equal(workflow.approvedBy, undefined);
    assert.equal((await api(url, { ...fields, version: 0 }, 'author', 'PUT')).status, 409, 'Stale update rejected');
    assert.equal((await api(url, { ...fields, version: workflow.version }, 'viewer', 'PUT')).status, 403);
    const transition = async (action, actor = 'author', expected = 200) => {
      result = await api(url + '/transition', { version: workflow.version, action, reason: 'Evidence reviewed' }, actor);
      assert.equal(result.status, expected, JSON.stringify(result)); if (expected === 200) workflow = result.data;
    };
    await transition('assess'); await transition('submit'); await transition('approve', 'author', 403); await transition('approve', 'chief');
    assert.equal(workflow.stage, 'In Treatment');
    result = await api(url, { ...fields, progress: 100, evidence: '/files/test-report.pdf', verificationNotes: 'Recovery succeeded', version: workflow.version }, 'author', 'PUT'); assert.equal(result.status, 200); workflow = result.data;
    await transition('complete'); assert.equal(workflow.stage, 'Pending Verification');
    result = await api(`/${encodeURIComponent(id)}`, { ...risk, residualLikelihood: 1, residualImpact: 3 }, 'author', 'PUT'); assert.equal(result.status, 200, JSON.stringify(result));
    workflow = (await api(url)).data; assert.equal(workflow.stage, 'Pending Verification');
    await transition('verify', 'author', 403); await transition('verify', 'reviewer'); assert.equal(workflow.stage, 'Monitoring');
    await transition('requestClosure'); await transition('close', 'chief'); assert.equal(workflow.stage, 'Closed');
    assert.equal((await api('')).data.find(row => row.riskId === id).workflowStatus, 'Closed');
    result = await api(`/${encodeURIComponent(id)}`, { ...risk, likelihood: 5 }, 'author', 'PUT'); assert.equal(result.status, 409);
    assert.equal((await api(url)).data.stage, 'Closed');
    await transition('reassess');
    // A material register edit invalidates approval, even through the existing CRUD route.
    await transition('assess'); await transition('submit'); await transition('approve', 'chief');
    result = await api(`/${encodeURIComponent(id)}`, { ...risk, likelihood: 5 }, 'author', 'PUT'); assert.equal(result.status, 200);
    workflow = (await api(url)).data; assert.equal(workflow.stage, 'Draft'); assert.equal(workflow.approvedBy, null);
    assert.ok(workflow.history.some(event => event.action === 'assessmentChanged'));
    // Concurrent updates commit one version; the second request conflicts.
    const raced = await Promise.all([api(url, { ...fields, version: workflow.version }, 'author', 'PUT'), api(url, { ...fields, version: workflow.version }, 'author', 'PUT')]);
    assert.deepEqual(raced.map(r => r.status).sort(), [200, 409]);
    const acceptanceService = require('../src/services/riskAcceptanceService');
    const form = await acceptanceService.create({ requestorName: 'Test owner', assetName: 'Service', department: 'IT', riskDescription: 'Service outage', benefitJustification: 'Dependency replacement', mitigationPlan: 'Monitoring', businessOwnerDecision: 'temporary', remediationDate: future, requestorPrintName: 'Test owner', requestorSignature: 'Test owner', requestorDate: day, cioName: 'Test CIO', cioSignature: 'Test CIO', cioDate: day, cisDecision: 'conditional', cisName: 'Test CIS', cisSignature: 'Test CIS', cisDate: day, cisConditions: 'Monthly review' });
    result = await api(`/${encodeURIComponent(draftId)}`, { ...risk, treatmentAction: 'Acceptance' }, 'author', 'PUT'); assert.equal(result.status, 200);
    const acceptedUrl = `/${encodeURIComponent(draftId)}/workflow`;
    result = await api(acceptedUrl, { ...fields, acceptanceFormId: form.id, version: 0 }, 'author', 'PUT'); assert.equal(result.status, 200); let accepted = result.data;
    for (const [action, actor] of [['assess', 'author'], ['submit', 'author'], ['approve', 'chief']]) { result = await api(acceptedUrl + '/transition', { version: accepted.version, action, reason: 'Temporary risk approved' }, actor); assert.equal(result.status, 200, JSON.stringify(result)); accepted = result.data; }
    assert.equal(accepted.stage, 'Accepted'); assert.equal(accepted.isActiveAcceptance, true);
    await pool.query('UPDATE risk_acceptance_forms SET cis_conditions=$2 WHERE id=$1', [form.id, 'Changed conditions']);
    result = await api(acceptedUrl); assert.equal(result.data.acceptanceChanged, true); assert.equal(result.data.isActiveAcceptance, false);
    assert.equal((await api(acceptedUrl + '/transition', { version: accepted.version, action: 'review', reason: 'Cannot reuse stale approval' })).status, 409);
    await pool.query("UPDATE risk_workflows SET data=jsonb_set(data, '{acceptanceExpiry}', to_jsonb($2::text)) WHERE risk_id=$1", [draftId, day]);
    result = await api(acceptedUrl); assert.equal(result.data.expired, true); assert.equal(result.data.effectiveStage, 'Review Required');
    console.log('PASS: linked acceptance, authenticated approval, changed form invalidation and expiry.');
    console.log('PASS: real transactions, draft, scoring, approval, verification, closure, history, stale versions and permissions.');
    if (process.env.RISK_WORKFLOW_API_ONLY === '1') return;
    const debugPort = 9900 + Math.floor(Math.random() * 100);
    chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let target;
    for (let i = 0; i < 100; i++) { try { target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await delay(100); } }
    assert.ok(target); cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.connect();
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Network.setCookie', { name: 'nist_session', value: tokens.author, url: base, httpOnly: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: base + '/app' });
    await cdp.wait('document.querySelector("#riskWorkflowForm") && document.querySelector("#riskDropdownManager")');
    await cdp.evaluate('NistTheme.set("dark");document.querySelector("[data-view=risk-management]").click();document.querySelector("[data-risk-tab=register]").click()');
    await cdp.wait('document.querySelectorAll("[data-rw-open]").length===2');
    await cdp.evaluate(`document.querySelector('[data-rw-open="${id}"]').click()`);
    await cdp.wait('document.querySelector("#riskWorkflowModal").open && document.querySelector("#rwStage").textContent.includes("Draf")');
    assert.equal(await cdp.evaluate('getComputedStyle(document.querySelector("#riskWorkflowModal")).backgroundColor'), 'rgb(26, 38, 56)');
    assert.equal(await cdp.evaluate('getComputedStyle(document.querySelector("#rwThreat")).backgroundColor'), 'rgb(20, 32, 51)');
    await cdp.evaluate('document.querySelector("#rwEvidence").value="UI evidence";document.querySelector("#riskWorkflowForm").requestSubmit()');
    await cdp.wait('document.querySelector("#rwStatus").textContent.includes("Data tersimpan")');
    assert.equal((await api(url)).data.evidence, 'UI evidence');
    // Validate the exact attachment structure from the user's screenshot in dark and light mode.
    await cdp.evaluate('const fixture=document.createElement("div");fixture.className="attachment-item";fixture.id="rwAttachmentPreview";fixture.innerHTML="<span class=attachment-name>struktur-organisasi.png</span><button class=attachment-action-button>Open</button>";document.querySelector("#rwHistory").prepend(fixture)');
    assert.equal(await cdp.evaluate('getComputedStyle(document.querySelector("#rwAttachmentPreview")).backgroundColor'), 'rgb(32, 47, 69)');
    await fs.writeFile('output/risk-workflow-dark-preview.png', Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    await cdp.evaluate('NistTheme.set("light")');
    assert.notEqual(await cdp.evaluate('getComputedStyle(document.querySelector("#rwAttachmentPreview")).backgroundColor'), 'rgb(32, 47, 69)');
    for (const width of [768, 390]) { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: true }); assert.ok(await cdp.evaluate('document.querySelector("#riskWorkflowModal").getBoundingClientRect().right <= innerWidth + 1')); }
    assert.deepEqual(cdp.errors, []); console.log('PASS: workflow UI save, dark/light attachment contrast, responsive modal and no browser exceptions.');
  } finally {
    cdp?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = query; pool.connect = connect; await query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    const resolved = path.resolve(profile); if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('nist-risk-workflow-')) { await delay(1000); await fs.rm(resolved, { recursive: true, force: true }).catch(() => {}); }
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
