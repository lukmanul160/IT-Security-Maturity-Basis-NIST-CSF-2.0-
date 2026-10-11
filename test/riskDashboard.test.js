const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const register = require('../src/services/riskManagementService');
const reports = require('../src/services/riskDashboardReportService');
const XLSX = require('xlsx');
const { PDFDocument } = require('pdf-lib');

function dashboard(rows) {
  const controls = Object.fromEntries(['rdPeriod', 'rdStart', 'rdEnd', 'rdScope', 'rdCategory', 'rdOwner', 'riskRegisterSearch', 'riskRegisterCategoryFilter', 'riskRegisterRatingFilter', 'riskRegisterTreatmentFilter'].map(id => [id, { value: id === 'rdPeriod' || id.endsWith('Filter') ? 'all' : '' }]));
  const context = vm.createContext({ Intl, Date, riskManagementRows: rows, $: id => controls[id] });
  const source = fs.readFileSync('frontend/client/src/workspace/features/risk-management/dashboard.js', 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('function rdSetDrill')), context);
  return { controls, run: expression => vm.runInContext(expression, context) };
}
const risks = [
  { riskId: 'R1', effectedAsset: 'Server', deviceName: 'Gateway', riskCategory: 'Technical', riskOwner: 'SOC', likelihood: 5, impact: 5, residualLikelihood: 2, residualImpact: 2, treatmentAction: 'Mitigation', deadline: '2000-01-01', createdAt: '2026-01-15T00:00:00Z' },
  { riskId: 'R2', effectedAsset: 'Server', deviceName: 'DB', riskCategory: 'Technical', riskOwner: 'IT', likelihood: 4, impact: 4, treatmentAction: 'Closed', deadline: '2000-01-01', createdAt: '2026-03-10T00:00:00Z' },
  { riskId: 'R3', effectedAsset: 'Laptop', deviceName: 'Gateway', riskCategory: 'Operational', riskOwner: 'SOC', likelihood: 2, impact: 2, treatmentAction: 'Acceptance', createdAt: '2026-02-10T00:00:00Z' }
];
test('dashboard filters combine scope, category, owner and custom dates without mutating the register', () => {
  const { controls, run } = dashboard(risks);
  controls.rdScope.value = 'a:Server'; controls.rdCategory.value = 'Technical'; controls.rdOwner.value = 'SOC';
  assert.deepEqual(Array.from(run('rdBaseRows().map(r => r.riskId)')), ['R1']);
  controls.rdOwner.value = ''; controls.rdPeriod.value = 'custom'; controls.rdStart.value = '2026-03-01'; controls.rdEnd.value = '2026-03-31';
  assert.deepEqual(Array.from(run('rdBaseRows().map(r => r.riskId)')), ['R2']);
  controls.rdEnd.value = '2026-01-01'; assert.equal(run('rdBaseRows().length'), 0);
  assert.equal(risks.length, 3);
});
test('overdue excludes Closed, missing residual stays unrated and matrix drill-down uses the selected assessment', () => {
  const { run } = dashboard(risks);
  assert.equal(run('riskManagementRows.filter(rdOverdue).length'), 1);
  assert.equal(run('rdScore(riskManagementRows[1], "residual")'), null);
  run('rdState.drill = { kind: "matrix", mode: "residual", l: 2, i: 2 }');
  assert.deepEqual(Array.from(run('rdVisibleRows().map(r => r.riskId)')), ['R1']);
  run('rdState.drill = { kind: "high" }');
  assert.deepEqual(Array.from(run('rdVisibleRows().map(r => r.riskId)')), ['R1']);
});
test('category drill-down handles risks without a category', () => {
  const { run } = dashboard([{ riskId: 'legacy' }]);
  run('rdState.drill = { kind: "category", value: "Belum ditetapkan" }');
  assert.equal(run('rdVisibleRows().length'), 1);
});
test('single register combines dashboard drill-down with local category, rating, treatment and search', () => {
  const { controls, run } = dashboard(risks);
  controls.rdScope.value = 'a:Server';
  run('rdState.drill = { kind: "high" }');
  controls.riskRegisterCategoryFilter.value = 'Technical'; controls.riskRegisterTreatmentFilter.value = 'Mitigation';
  controls.riskRegisterSearch.value = 'R1';
  assert.deepEqual(Array.from(run('rdVisibleRows().map(r => r.riskId)')), ['R1']);
  controls.riskRegisterSearch.value = 'R2'; assert.equal(run('rdVisibleRows().length'), 0);
});
test('drill-down clears stale local filters and opens the single Risk Register tab', () => {
  const controls = Object.fromEntries(['riskRegisterSearch', 'riskRegisterCategoryFilter', 'riskRegisterRatingFilter', 'riskRegisterTreatmentFilter'].map(id => [id, { value: 'stale' }]));
  const calls = [];
  controls.riskRegisterPanel = { scrollIntoView: () => calls.push('scroll') };
  const context = vm.createContext({ $: id => controls[id], riskRegisterPage: 4, renderRiskDashboard: () => calls.push('render'), setRiskManagementTab: tab => calls.push(tab) });
  const source = fs.readFileSync('frontend/client/src/workspace/features/risk-management/dashboard.js', 'utf8');
  vm.runInContext('const rdState = { drill: null };' + source.slice(source.indexOf('function rdClearRegisterFilters'), source.indexOf('function rdRenderRegisterContext')), context);
  vm.runInContext('rdSetDrill({ kind: "high", label: "High" })', context);
  assert.deepEqual(calls, ['render', 'register', 'scroll']);
  assert.equal(controls.riskRegisterSearch.value, ''); assert.equal(controls.riskRegisterCategoryFilter.value, 'all');
  assert.equal(context.riskRegisterPage, 1);
  const markup = fs.readFileSync('frontend/client/src/workspace/components/RiskManagementView.vue', 'utf8');
  assert.equal(markup.includes('ACTIONABLE RISKS'), false); assert.equal(markup.includes('id="rdBody"'), false);
  assert.equal((markup.match(/id="riskRegisterBody"/g) || []).length, 1);
});
test('editing a risk preserves an ISO deadline in the native date input', () => {
  const fields = { rmDeadline: { type: 'date', value: '' }, riskRegisterOriginalId: {}, riskRegisterFormTitle: {}, riskRegisterSubmit: {} };
  const context = vm.createContext({ $: id => fields[id], riskManagementFields: ['deadline'], riskDate: value => String(value || '').slice(0, 10), updateRiskCalculations() {}, openRiskManagementModal() {} });
  const source = fs.readFileSync('frontend/client/src/workspace/features/risk-management/register.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('function fillRiskManagementForm'), source.indexOf('function renderRiskRegister')), context);
  vm.runInContext('fillRiskManagementForm({riskId:"R1", deadline:"2026-10-01T00:00:00.000Z"})', context);
  assert.equal(fields.rmDeadline.value, '2026-10-01');
  assert.equal(fields.riskRegisterOriginalId.value, 'R1');
});
test('Excel report fetches authoritative rows, keeps strings literal, and only includes requested IDs', async t => {
  t.mock.method(register, 'listRegister', async () => risks.map(r => ({ ...r, comment: '=HYPERLINK("https://example.com")' })));
  const result = await reports.createReport({ format: 'xlsx', riskIds: ['R1', 'nonexistent'], riskRegister: [{ riskId: 'R1', likelihood: 1 }] });
  const workbook = XLSX.read(result.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Risk Register']);
  assert.equal(rows.length, 1); assert.equal(rows[0]['Inherent score'], 25);
  assert.equal(rows[0]['Residual score'], 4);
  const cell = workbook.Sheets['Risk Register'].Q2;
  assert.equal(cell.t, 's'); assert.equal(cell.f, undefined);
});
test('PDF report paginates long content and rejects unsupported formats', async t => {
  t.mock.method(register, 'listRegister', async () => [{ ...risks[0], identificationRisk: '長いリスク '.repeat(2000) }]);
  const result = await reports.createReport({ format: 'pdf', riskIds: ['R1'] });
  const pdf = await PDFDocument.load(result.buffer);
  assert.ok(pdf.getPageCount() > 1);
  await assert.rejects(reports.createReport({ format: 'exe', riskIds: [] }), { status: 400 });
  await assert.rejects(reports.createReport({ format: 'pdf', riskIds: 'R1' }), { status: 400 });
});
test('report route allows read-only users and denies users without Risk Register read access', async t => {
  const express = require('express'), app = express();
  const { pool } = require('../src/config/database');
  let allowed = true, reads = 0;
  t.mock.method(pool, 'query', async () => ({ rows: [{ allowed, actions: { read: allowed, create: false, update: false, delete: false } }] }));
  t.mock.method(register, 'listRegister', async () => { reads++; return risks; });
  app.use(express.json()); app.use((req, res, next) => { req.user = { username: 'viewer', role: 'viewer' }; next(); });
  app.use('/api/risk-management', require('../src/routes/riskManagementRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const request = () => fetch(`http://127.0.0.1:${server.address().port}/api/risk-management/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'xlsx', riskIds: ['R1'] }) });
  const response = await request(); assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /risk-dashboard.xlsx/); await response.arrayBuffer();
  allowed = false; assert.equal((await request()).status, 403); assert.equal(reads, 1);
});
