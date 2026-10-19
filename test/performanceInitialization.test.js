const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');

test('notes initialize once for concurrent readers and retry after initialization failure', async t => {
  const modulePath = require.resolve('../src/services/knowledgeNoteService');
  delete require.cache[modulePath];
  const notes = require(modulePath);
  let failed = false, calls = 0;
  t.mock.method(pool, 'query', async () => {
    calls++;
    if (!failed) { failed = true; throw Error('Temporary database outage'); }
    return { rows: [] };
  });
  t.mock.method(require('../src/services/knowledgeImageService'), 'ensureStore', async () => {});
  await assert.rejects(notes.ensureStore(), /Temporary database outage/);
  await Promise.all(Array.from({ length: 25 }, () => notes.ensureStore()));
  const initializedCalls = calls;
  await notes.ensureStore();
  assert.equal(calls, initializedCalls);
  assert.equal(calls, 6); // Failed attempt, then five migration statements, once.
});

test('assessment routing reads small metadata once before executing a non-legacy request', async t => {
  const service = require('../src/services/assessmentPeriodService');
  const { assessmentYear } = require('../src/middleware/assessmentYear');
  t.mock.method(service, 'ensureStore', async () => {});
  let reads = 0;
  t.mock.method(pool, 'query', async sql => {
    assert.match(sql, /^SELECT legacy FROM assessment_periods/);
    reads++; return { rows: [{ legacy: false }] };
  });
  t.mock.method(require('../src/services/permissionService'), 'has', async () => true);
  t.mock.method(service, 'execute', async () => [{ id: 'fixture' }]);
  const res = { set() { return this; }, status(code) { assert.equal(code, 200); return this; }, json(value) { assert.deepEqual(value, [{ id: 'fixture' }]); } };
  await assessmentYear({ path: '/ikas', method: 'GET', query: {}, user: { role: 'viewer' } }, res, () => assert.fail('Unexpected legacy fallback'));
  assert.equal(reads, 1);
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  await assert.rejects(service.periodMetadata('ikas', 2026), { status: 404 });
});

test('concurrent dashboard refreshes share work only for the same identity and current permissions', async t => {
  const service = require('../src/services/monitoringDashboardService');
  const permissions = require('../src/services/permissionService');
  let access = { 'risk-management': { read: true } }, queries = 0;
  t.mock.method(permissions, 'getRoleActions', async () => access);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(pool, 'query', async () => { queries++; await gate; return { rows: [] }; });
  const user = { username: 'one', role: 'viewer' };
  const requests = Array.from({ length: 25 }, () => service.snapshot(user));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries, 1);
  const otherUser = service.snapshot({ ...user, username: 'two' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries, 2);
  access = {};
  assert.deepEqual((await service.snapshot(user)).modules, []);
  release();
  await Promise.all([...requests, otherUser]);
  access = { 'risk-management': { read: true } };
  await service.snapshot(user);
  assert.equal(queries, 3); // Completed results are not cached.
});
