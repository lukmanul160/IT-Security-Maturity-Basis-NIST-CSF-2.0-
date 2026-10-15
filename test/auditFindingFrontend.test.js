const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
for (const name of ['record-index', 'detail-view']) {
  vm.runInContext(fs.readFileSync(`frontend/client/src/workspace/features/audit-finding/${name}.js`, 'utf8'), context);
}

test('snapshot index preserves hierarchy, child ordering and fresh records after reload', () => {
  const records = [
    { id: 'audit', parentId: null },
    { id: 'finding', parentId: 'audit' },
    { id: 'first', parentId: 'finding' },
    { id: 'second', parentId: 'finding' }
  ];
  const index = context.createAuditRecordIndex(records);
  assert.deepEqual(Array.from(index.ancestors(records[2]), row => row.id), ['audit', 'finding']);
  assert.deepEqual(Array.from(index.children('finding'), row => row.id), ['first', 'second']);
  assert.equal(index.get('finding'), records[1]);
  const refreshed = { id: 'finding', parentId: null };
  assert.equal(context.createAuditRecordIndex([refreshed]).get('finding'), refreshed);
  assert.equal(index.get('missing'), undefined);
  assert.equal(index.children('missing').length, 0);
});

test('missing parents and cyclic hierarchy terminate without including the record itself', () => {
  const records = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'orphan', parentId: 'missing' }];
  const index = context.createAuditRecordIndex(records);
  assert.deepEqual(Array.from(index.ancestors(records[0]), row => row.id), ['b']);
  assert.equal(index.ancestors(records[2]).length, 0);
});

test('detail rendering keeps closed findings in totals, sorts overdue first and escapes text', () => {
  const findings = [
    { id: 'closed', parentId: 'audit', data: { status: 'Closed' } },
    { id: 'later', parentId: 'audit', data: { title: 'Later', status: 'Open', dueDate: '2026-12-01' } },
    { id: 'due', parentId: 'audit', data: { title: '<unsafe>', description: '<script>', status: 'Open', dueDate: '2026-01-01' } },
    { id: 'other', parentId: 'other-audit', data: { title: 'Excluded', status: 'Open' } }
  ];
  const html = context.renderAuditFindingDetails({ id: 'audit' }, {
    findings,
    children: id => id === 'due' ? [{ kind: 'followup' }, { kind: 'evidence' }] : [],
    isOverdue: row => row.id === 'due',
    escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  });
  assert.match(html, /3 finding · 1 selesai · 2 belum selesai/);
  assert.match(html, /1 follow-up/);
  assert.match(html, /&lt;script&gt;/);
  assert.ok(html.indexOf('&lt;unsafe&gt;') < html.indexOf('Later'));
  assert.ok(!html.includes('Excluded'));
  assert.equal(findings[1].id, 'later');
});
