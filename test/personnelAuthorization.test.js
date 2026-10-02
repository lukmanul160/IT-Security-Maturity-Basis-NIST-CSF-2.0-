const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { pool } = require('../src/config/database');
const service = require('../src/services/personnelCertificationService');
const router = require('../src/routes/personnelCertificationRoutes');

test('employee administration is admin-only; users can add certificates but cannot edit or delete', async t => {
  // Exercise the real routes and permission middleware with isolated service/database stubs.
  let pageAllowed = true;
  t.mock.method(pool, 'query', async () => ({ rows: [{ allowed: pageAllowed }] }));
  const calls = [];
  for (const method of ['createOrganizationPersonnel', 'updateOrganizationPersonnel', 'removeOrganizationPersonnel', 'create', 'update', 'remove', 'updateLayout']) {
    t.mock.method(service, method, async () => { calls.push(method); return { id: 1 }; });
  }
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { role: req.get('x-test-role') }; next(); });
  app.use('/personnel', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (role, method, path) => fetch(`http://127.0.0.1:${server.address().port}/personnel${path}`, { method, headers: { 'x-test-role': role, 'Content-Type': 'application/json' }, body: '{}' });
  for (const role of ['user', 'editor', 'viewer', 'approver']) {
    for (const [method, path] of [['POST', '/organization-personnel'], ['PUT', '/organization-personnel/1'], ['DELETE', '/organization-personnel/1']]) {
      assert.equal((await request(role, method, path)).status, 403, `${role} ${method} employee`);
    }
  }
  assert.equal(calls.length, 0, 'rejected requests never reach employee service');
  for (const [method, path, status] of [['POST', '/organization-personnel', 201], ['PUT', '/organization-personnel/1', 200], ['DELETE', '/organization-personnel/1', 204]]) {
    assert.equal((await request('admin', method, path)).status, status);
  }
  assert.equal((await request('user', 'POST', '')).status, 201);
  for (const [method, path] of [['PUT', '/1'], ['PUT', '/1/layout'], ['DELETE', '/1']]) {
    assert.equal((await request('user', method, path)).status, 403);
  }
  assert.equal((await request('viewer', 'POST', '')).status, 403);
  assert.equal((await request('editor', 'POST', '')).status, 201);
  pageAllowed = false;
  assert.equal((await request('user', 'POST', '')).status, 403, 'page permission is still required');
});
