const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pool } = require('../src/config/database');
const audit = require('../src/services/auditService');

const signed = {
  id: 1, requestorName: 'Pemohon', assetName: 'Gateway', department: 'IT', businessOwnerDecision: 'temporary', cisDecision: 'approved',
  requestorSignature: 'Pemohon', requestorDate: '2026-10-01', cioName: 'CIO', cioSignature: 'CIO', cioDate: '2026-10-02',
  cisName: 'CIS', cisSignature: 'CIS', cisDate: '2026-10-03', remediationDate: '2026-10-20'
};
function modelContext(rows = []) {
  const fields = Object.fromEntries(['raStatus', 'raAsset', 'raDepartment', 'raReview', 'raSearch'].map(id => [id, { value: '' }]));
  const context = vm.createContext({ Date, Intl, riskAcceptanceForms: rows, $: id => fields[id] });
  const source = fs.readFileSync('frontend/client/src/workspace/features/risk-acceptance/dashboard.js', 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('function raPopulateFilters')), context);
  return { fields, context, run: expression => vm.runInContext(expression, context) };
}
test('default Approved selection without signatures is Pending; rejected decisions override complete signatures', () => {
  const { context, run } = modelContext();
  context.form = { ...signed, cisSignature: '' };
  assert.equal(run('raModel(form,"2026-10-10").status'), 'pending');
  assert.equal(run('raModel(form,"2026-10-10").active'), false);
  context.form = { ...signed, businessOwnerDecision: 'denied' };
  assert.equal(run('raModel(form,"2026-10-10").status'), 'rejected');
  assert.equal(run('raModel(form,"2026-10-10").accepted'), false);
  context.form = { ...signed, cisDecision: 'denied' };
  assert.equal(run('raModel(form,"2026-10-10").status'), 'rejected');
  context.form = { ...signed, cisDecision: 'conditional' };
  assert.equal(run('raModel(form,"2026-10-10").status'), 'conditional');
  assert.equal(run('raModel(form,"2026-10-10").active'), true);
});
test('review windows include today and H-30, exclude H-31, and never invent expiry from one_year', () => {
  const { context, run } = modelContext();
  for (const [date, soon, overdue] of [['2026-10-10', true, false], ['2026-11-09', true, false], ['2026-11-10', false, false], ['2026-10-09', false, true]]) {
    context.form = { ...signed, remediationDate: date };
    assert.equal(run('raModel(form,"2026-10-10").soon'), soon); assert.equal(run('raModel(form,"2026-10-10").overdue'), overdue);
  }
  context.form = { ...signed, businessOwnerDecision: 'one_year', remediationDate: '' };
  assert.equal(run('raModel(form,"2026-10-10").date'), ''); assert.equal(run('raModel(form,"2026-10-10").active'), false);
  assert.equal(run('raModel(form,"2026-10-10").missing'), true);
  assert.equal(run('raDate("2026-02-30")'), '');
  assert.equal(run('raDate("2026-10-09T20:00:00Z")'), '2026-10-10');
});
test('global status, asset and department filters combine with calendar drill and search', () => {
  const rows = [signed, { ...signed, id: 2, department: 'Finance', cisSignature: '' }, { ...signed, id: 3, cisDecision: 'denied' }];
  const { fields, run } = modelContext(rows);
  fields.raStatus.value = 'approved'; fields.raAsset.value = 'Gateway'; fields.raDepartment.value = 'IT';
  run('raDashboardState.drill = { kind:"date",value:"2026-10-20" }');
  fields.raSearch.value = 'RAF-00001';
  assert.deepEqual(Array.from(run('raTableRows().map(form=>form.id)')), [1]);
  fields.raStatus.value = 'pending'; fields.raDepartment.value = ''; fields.raSearch.value = '';
  assert.deepEqual(Array.from(run('raTableRows().map(form=>form.id)')), [2]);
  assert.equal(rows.length, 3);
});
test('audit query matches exact request paths and creation response IDs, with bound pagination', async t => {
  let args, sql;
  t.mock.method(pool, 'query', async (query, values) => { sql = query; args = values; return { rows: [] }; });
  await audit.listRiskAcceptance('12', 20);
  assert.deepEqual(args, ['/api/risk-acceptance/12', '/api/risk-acceptance/12/export/pdf', '12', 20]);
  assert.match(sql, /path IN \(\$1, \$2\)/); assert.match(sql, /details->'response'->>'id' = \$3/);
  await assert.rejects(audit.listRiskAcceptance("12' OR 1=1"), { status: 400 });
});
test('per-request audit API remains Admin-only and rejects non-admin roles before reading logs', async t => {
  const express = require('express'), app = express(); let role = 'viewer', reads = 0;
  t.mock.method(audit, 'listRiskAcceptance', async () => { reads++; return [{ requestId: 'test' }]; });
  app.use((req, res, next) => { req.user = { username: 'test', role }; next(); });
  app.use('/api/risk-acceptance', require('../src/routes/riskAcceptanceRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const request = () => fetch(`http://127.0.0.1:${server.address().port}/api/risk-acceptance/1/audit`);
  assert.equal((await request()).status, 403); assert.equal(reads, 0);
  role = 'admin'; assert.equal((await request()).status, 200); assert.equal(reads, 1);
});
test('guarded acceptance save sends a request even when submission guard already disabled the button', async () => {
  const fields = Object.fromEntries(['riskAcceptanceId', 'riskAcceptanceSubmit', 'riskAcceptanceFormStatus', 'riskAcceptanceModal', 'riskAcceptancePageStatus'].map(id => [id, { value: '', disabled: false, textContent: '', close() {} }]));
  const context = vm.createContext({ WeakSet, $: id => fields[id], fetch: async () => { context.writes++; return { ok: true }; }, writes: 0, riskFormData: () => ({}), resetRiskAcceptanceForm() {}, loadRiskAcceptanceForms: async () => {} });
  const source = fs.readFileSync('frontend/client/src/workspace/features/risk-acceptance/forms.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function saveRiskAcceptanceForm'), source.indexOf('function deleteRiskAcceptanceForm')), context);
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/submission-guard.js', 'utf8'), context);
  const button = fields.riskAcceptanceSubmit; button.type = 'submit';
  context.event = { preventDefault() {}, currentTarget: { elements: [button], getAttribute: () => null, setAttribute() {}, removeAttribute() {} } };
  await vm.runInContext('guardFormSubmission(saveRiskAcceptanceForm)(event)', context);
  assert.equal(context.writes, 1); assert.equal(button.disabled, false);
});
