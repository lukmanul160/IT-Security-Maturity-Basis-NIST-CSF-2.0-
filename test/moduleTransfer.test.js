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
test('every requested module exposes a transfer definition', () => { assert.equal(Object.keys(load().modules).length, 7); });
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
