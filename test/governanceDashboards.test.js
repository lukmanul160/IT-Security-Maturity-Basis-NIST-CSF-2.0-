const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = file => fs.readFileSync(`frontend/client/src/workspace/features/${file}`, 'utf8');
const fields = values => Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
function context(extra = {}) {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-10T10:00:00Z'])); } }
  const ctx = vm.createContext({ Date: FixedDate, Intl, ...extra });
  vm.runInContext(read('shared/governance-dashboard.js'), ctx);
  vm.runInContext(read('policy-register/register-and-calendar.js').split('function renderPolicyReviewCalendar')[0], ctx);
  return ctx;
}
test('review windows use calendar days, include H-30 and today, and exclude closed overdue findings', () => {
  const ctx = context();
  for (const [expression, expected] of [
    ["gdReviewMatches('2026-10-10','soon')", true], ["gdReviewMatches('2026-11-09','soon')", true],
    ["gdReviewMatches('2026-11-10','soon')", false], ["gdReviewMatches('2026-10-09','overdue')", true],
    ["gdReviewMatches('2026-10-09','overdue',false)", false], ["gdReviewMatches('','missing')", true],
    ["gdReviewMatches('2026-02-30','missing')", true], ["gdReviewMatches('2026-10-10','overdue')", false]
  ]) assert.equal(vm.runInContext(expression, ctx), expected, expression);
});
test('policy review dates clamp month ends, validate dates, and do not invent deadlines for ad hoc cycles', () => {
  const ctx = context();
  for (const [row, expected] of [
    [{ lastReview: '2026-08-31', reviewCycle: 'Biannual' }, '2027-02-28'],
    [{ lastReview: '2024-02-29', reviewCycle: 'Annual' }, '2025-02-28'],
    [{ lastReview: '2026-10-01', reviewCycle: 'Ad hoc' }, null],
    [{ lastReview: '2026-02-30', reviewCycle: 'Annual' }, null],
    [{ lastReview: '', reviewCycle: 'Quarterly' }, null],
    [{ lastReview: '2026-10-01', reviewCycle: 'Unknown' }, null]
  ]) { ctx.row = row; assert.equal(vm.runInContext('getPolicyNextReviewDate(row)', ctx), expected); }
});
test('policy dashboard scope, drill-down, and original register search filters intersect', () => {
  const inputs = fields({ pdCategory: '', pdOwner: '', pdStatus: '', pdReview: '', policyRegisterCategoryFilter: 'all', policyRegisterOwnerFilter: 'all', policyRegisterStatusFilter: 'all', policyRegisterSearch: '' });
  const ctx = context({ $: id => inputs[id], policySearchText: row => row.title.toLowerCase(), policyRegisterRows: [
    { id: 1, title: 'Security one', category: 'Security', owner: 'Alice', approvalStatus: 'Approved', reviewCycle: 'Annual', lastReview: '2025-10-09' },
    { id: 2, title: 'Security two', category: 'Security', owner: 'Bob', approvalStatus: 'Draft', reviewCycle: 'Annual', lastReview: '2025-10-20' },
    { id: 3, title: 'Ad hoc', category: 'Operations', owner: 'Alice', approvalStatus: 'Approved', reviewCycle: 'Ad hoc', lastReview: '' }
  ] });
  vm.runInContext(read('policy-register/dashboard.js').split("$('policyRegisterView').addEventListener")[0], ctx);
  inputs.pdCategory.value = 'Security';
  assert.equal(vm.runInContext('pdGlobalRows().length', ctx), 2);
  vm.runInContext("pdDrill = {kind:'overdue'}", ctx);
  assert.equal(vm.runInContext('pdVisibleRows()[0].id', ctx), 1);
  inputs.policyRegisterSearch.value = 'two';
  assert.equal(vm.runInContext('pdVisibleRows().length', ctx), 0);
  vm.runInContext('pdDrill = null', ctx);
  assert.equal(vm.runInContext('pdVisibleRows()[0].id', ctx), 2);
  assert.equal(vm.runInContext("pdMatches(policyRegisterRows[2],'missing')", ctx), false);
});
test('audit finding filters preserve only matching findings and their audit, follow-ups, and evidence', () => {
  const inputs = fields({ afAudit: '', afOwner: '', afSeverity: '', afStatus: '', afReview: '' });
  const ctx = context({ $: id => inputs[id], rows: [
    { id: 'a', kind: 'audit', parentId: null, data: { title: 'Audit A' } },
    { id: 'b', kind: 'audit', parentId: null, data: { title: 'Audit B' } },
    { id: 'f', kind: 'finding', parentId: 'a', data: { owner: 'Alice', severity: 'Critical', status: 'Open', dueDate: '2026-10-09' } },
    { id: 'g', kind: 'finding', parentId: 'b', data: { owner: 'Bob', severity: 'Low', status: 'Closed', dueDate: '2026-10-01' } },
    { id: 'followup', kind: 'followup', parentId: 'f', data: {} },
    { id: 'evidence', kind: 'evidence', parentId: 'followup', data: {} }
  ] });
  const source = read('audit-finding/tracker.js');
  vm.runInContext(source.slice(source.indexOf('  function ancestors('), source.indexOf('  function openCard(')) + source.slice(source.indexOf('  function afFindings('), source.indexOf('  function afReset(')), ctx);
  inputs.afSeverity.value = 'Critical'; inputs.afReview.value = 'overdue';
  assert.deepEqual(Array.from(vm.runInContext('afScopedRows().map(row => row.id)', ctx)), ['a', 'f', 'followup', 'evidence']);
  inputs.afOwner.value = 'Bob';
  assert.equal(vm.runInContext('afScopedRows().length', ctx), 0);
  inputs.afSeverity.value = ''; inputs.afOwner.value = ''; inputs.afReview.value = '';
  assert.equal(vm.runInContext('afScopedRows().length', ctx), 6);
});
