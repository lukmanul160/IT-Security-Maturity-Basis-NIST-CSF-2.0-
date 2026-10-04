const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load(fetch = async () => { throw new Error('Unexpected request'); }) {
  const context = vm.createContext({ fetch, document: { getElementById: () => null, querySelector: () => null } });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/module-transfer.js', 'utf8') + '\nthis.api = moduleTransfer;', context);
  return context.api;
}
function payload(module, data) { return { format: 'nist-basis-module', version: 1, module, exportedAt: '2026-09-14', data }; }
test('every requested module exposes a transfer definition', () => { assert.equal(Object.keys(load().modules).length, 10); });

test('TPRM exports include questionnaires, template sections, and CIA assessments in reports', async () => {
  const records = {
    '/api/tprm-questionnaires': [{ id: 1, vendorName: 'Vendor A', status: 'Draft', result: 'Pending', responses: { answer: '<answer>' } }],
    '/api/questionnaire-templates': [{ id: 2, template_name: 'Security', sections: [['Program', ['MFA enabled?']]], is_default: true }],
    '/api/tprm': [{ id: 3, thirdParty: 'Vendor A', questionnaireId: 1, serviceDependency: 'Hosting', dueDiligenceAssessment: { confidentiality: 4 }, riskRegisterIds: ['CSR-001'] }]
  };
  const api = load(async url => ({ ok: true, json: async () => records[url] }));
  for (const key of ['tprm-questionnaire', 'questionnaire-templates', 'tprm-register']) {
    const file = await api.collect(key);
    api.validate(key, file);
    const html = api.report(key, file);
    assert.ok(html.includes(key === 'tprm-questionnaire' ? '&lt;answer&gt;' : key === 'questionnaire-templates' ? 'MFA enabled?' : 'confidentiality'));
  }
});

test('TPRM checks vendor and risk references before writes and normalizes nextReview', async () => {
  const calls = [];
  const api = load(async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => url === '/api/tprm-questionnaires' ? [{ id: 8, vendorName: 'Vendor A' }] : url === '/api/risk-management' ? [{ riskId: 'CSR-001' }] : options.method === 'GET' ? [{ id: 3 }] : {} };
  });
  const row = { id: 3, thirdParty: 'Vendor A', questionnaireId: 8, serviceDependency: 'Hosting', riskRegisterIds: ['CSR-001'], nextReview: '2026-12-01T00:00:00Z' };
  await api.importPayload('tprm-register', payload('tprm-register', { register: [row] }));
  assert.equal(JSON.parse(calls.at(-1).body).nextReview, '2026-12-01');
  calls.length = 0;
  await assert.rejects(api.importPayload('tprm-register', payload('tprm-register', { register: [{ ...row, questionnaireId: 99 }] })), /0 data.*Referensi vendor/);
  assert.ok(calls.every(call => call.method === 'GET'));
  await assert.rejects(api.importPayload('tprm-register', payload('tprm-register', { register: [{ ...row, riskRegisterIds: ['missing'] }] })), /Referensi Risk Register/);
});

test('invalid questionnaires and template sections are rejected before requests', async () => {
  await assert.rejects(load().importPayload('tprm-questionnaire', payload('tprm-questionnaire', { questionnaires: [{ vendorName: 'A', status: 'Unknown', result: 'Pending' }] })), /tidak valid/);
  await assert.rejects(load().importPayload('questionnaire-templates', payload('questionnaire-templates', { templates: [{ template_name: 'A', sections: [['Section', []]] }] })), /tidak valid/);
});

test('each module template has matching headers and passes its import format validation', () => {
  const api = load();
  for (const key of Object.keys(api.modules)) {
    const file = JSON.parse(JSON.stringify(api.template(key)));
    assert.equal(api.validate(key, file), file);
    for (const section of api.modules[key].sections) assert.ok(file.headers[section.key]);
    assert.ok(file.instructions.some(text => text.includes('YYYY-MM-DD')));
  }
  assert.ok(api.template('personnel').headers.certifications.personnelId);
  const risk = api.template('risk-management');
  assert.ok(risk.headers.register.deviceName);
  assert.equal(risk.examples.register[0].likelihood, 3);
  assert.equal(risk.data.register.length, 0);
});

test('risk report includes complete register fields and collect exports only the risk register', async () => {
  const urls = [];
  const api = load(async url => { urls.push(url); return { ok: true, json: async () => [{ riskId: 'CSR-001', deviceName: 'Laptop-001', riskCause: 'Unpatched', comment: 'Follow up' }] }; });
  const file = await api.collect('risk-management');
  assert.deepEqual(urls, ['/api/risk-management']);
  assert.equal(file.data.register[0].deviceName, 'Laptop-001');
  const html = api.report('risk-management', file);
  for (const text of ['Device Name', 'Risk Cause', 'Laptop-001', 'Unpatched', 'Follow up']) assert.ok(html.includes(text));
});
test('reject wrong modules, missing sections, duplicate IDs and invalid scores before writing', async () => {
  const api = load();
  assert.throws(() => api.validate('csf', payload('privacy', {})), /modul/);
  assert.throws(() => api.validate('iso27001', payload('iso27001', {})), /daftar/);
  assert.throws(() => api.validate('policy-register', payload('policy-register', { register: [{ id: 1 }, { id: '1' }] })), /duplikat/);
  await assert.rejects(api.importPayload('csf', payload('csf', { assessment: { scores: { x: 99 }, notes: {} } })), /0–5/);
});
test('reports escape imported content and include module-specific columns and empty state', () => {
  const api = load();
  const html = api.report('policy-register', payload('policy-register', { register: [{ title: '<script>alert(1)</script>', approvalStatus: 'Approved' }] }));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Approved: 1'));
  assert.ok(html.includes('Review Cycle'));
  assert.ok(api.report('risk-management', payload('risk-management', { register: [] })).includes('Belum ada data'));
});
test('assessment failures are surfaced without claiming success', async () => {
  const api = load(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Access denied' }) }));
  await assert.rejects(api.importPayload('csf', payload('csf', { assessment: { scores: {}, notes: {} } })), /0 data sudah tersimpan.*Access denied/);
});
test('assessment report groups policy/practice notes and evidence under one control', () => {
  const api = load();
  const records = api.rows({ assessment: true }, { scores: {}, policyScores: { 'GV.OC-1': 3 }, notes: { 'policy-GV.OC-1': 'Review annually' }, attachments: { 'privacy-practice-GV.OC-1': [{ name: 'Evidence.pdf' }] } });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'GV.OC-1');
  assert.equal(records[0].notes['policy-GV.OC-1'], 'Review annually');
  assert.equal(records[0].attachments['privacy-practice-GV.OC-1'][0].name, 'Evidence.pdf');
});
test('broken personnel references are rejected before any request', async () => {
  await assert.rejects(load().importPayload('personnel', payload('personnel', { personnel: [], certifications: [{ personnelId: 9 }] })), /Relasi pegawai/);
});
test('upsert uses encoded risk ID and normalizes exported dates', async () => {
  const calls = [];
  const api = load(async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => options.method === 'GET' ? [{ riskId: 'CSR - 001' }] : {} }; });
  assert.equal(await api.importPayload('risk-management', payload('risk-management', { register: [{ riskId: 'CSR - 001', deadline: '2026-10-01T00:00:00.000Z' }] })), 1);
  assert.equal(calls[1].method, 'PUT');
  assert.ok(calls[1].url.endsWith('CSR%20-%20001'));
  assert.equal(JSON.parse(calls[1].body).deadline, '2026-10-01');
});
test('personnel imports remap certifications to newly created employee IDs', async () => {
  const writes = [];
  const api = load(async (url, options) => { if (options.body) writes.push(JSON.parse(options.body)); return { ok: true, json: async () => options.method === 'GET' ? [] : { id: 42 } }; });
  const result = await api.importPayload('personnel', payload('personnel', { personnel: [{ id: 7, personnelName: 'Alice' }], certifications: [{ id: 10, personnelId: 7, certificationName: 'CISSP' }] }));
  assert.equal(result, 2); assert.equal(writes[1].personnelId, 42);
});
test('partial import reports persisted count and stops subsequent writes', async () => {
  let count = 0;
  const api = load(async (url, options) => { if (options.method === 'GET') return { ok: true, json: async () => [] }; count++; return count === 1 ? { ok: true, json: async () => ({ id: 1 }) } : { ok: false, status: 400, json: async () => ({ error: 'Invalid row' }) }; });
  await assert.rejects(api.importPayload('policy-register', payload('policy-register', { register: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] })), /1 data sudah tersimpan.*Invalid row/);
  assert.equal(count, 2);
});

function loadAuditHelpers(fetch) {
  const context = vm.createContext({ fetch, document: { getElementById: () => null, querySelector: () => null } });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/module-transfer.js', 'utf8'), context);
  return context;
}
test('transfer records initiated and success with actual filename and count', async () => {
  const events = [];
  const api = loadAuditHelpers(async (url, options) => { events.push(JSON.parse(options.body)); return { ok: true }; });
  assert.equal(await api.runAuditedTransfer('import', 'csf', 'input.json', async () => 3, 'Import selesai'), 3);
  assert.deepEqual(events.map(row => row.outcome), ['initiated', 'success']);
  assert.equal(events[1].count, 3); assert.equal(events[1].filename, 'input.json'); assert.equal(events[1].message, 'Import selesai');
});
test('partial import records failure with error and persisted count', async () => {
  const events = [];
  const api = loadAuditHelpers(async (url, options) => { events.push(JSON.parse(options.body)); return { ok: true }; });
  const failure = Object.assign(new Error('2 data tersimpan; Access denied'), { completedCount: 2 });
  await assert.rejects(api.runAuditedTransfer('import', 'csf', 'input.json', async () => { throw failure; }), /Access denied/);
  assert.equal(events[1].outcome, 'failed'); assert.equal(events[1].count, 2); assert.equal(events[1].error, failure.message);
});
test('missing audit endpoint exposes HTTP and restart hint before transfer', async () => {
  let ran = false;
  const api = loadAuditHelpers(async () => ({ ok: false, status: 404, json: async () => ({ error: 'Route not found', requestId: 'req-1' }) }));
  await assert.rejects(api.runAuditedTransfer('export', 'csf', 'data.json', () => { ran = true; }), /HTTP 404.*Restart backend.*req-1/);
  assert.equal(ran, false);
});
test('audit failure after completion reports that operation already succeeded', async () => {
  let calls = 0;
  const api = loadAuditHelpers(async () => ++calls === 1 ? { ok: true } : { ok: false, status: 503, json: async () => ({ error: 'Database unavailable' }) });
  await assert.rejects(api.runAuditedTransfer('download', 'csf', 'template.json', async () => {}, 'Template berhasil dibuat'), /Aktivitas selesai.*HTTP 503.*Database unavailable/);
});
