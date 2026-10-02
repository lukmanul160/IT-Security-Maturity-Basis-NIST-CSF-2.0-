const test = require('node:test');
const assert = require('node:assert/strict');
const permission = require('../src/services/permissionService');
const { pool } = require('../src/config/database');

test('users can enter data in operational modules without administrative or shared-delete privileges', async t => {
  let assigned = true;
  t.mock.method(pool, 'query', async () => ({ rows: [{ allowed: assigned }] }));
  const modules = ['framework', 'csf', 'privacy', 'iso27001', 'iso27001-soa', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'audit-finding-tracker', 'policy-register', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'tprm-register', 'questionnaire-templates'];
  for (const module of modules) {
    for (const action of ['read', 'create', 'update']) {
      assert.equal(await permission.has('user', module, action), true, `${module}/${action}`);
      assert.equal(await permission.has('viewer', module, action), action === 'read', `viewer ${module}/${action}`);
    }
    assert.equal(await permission.has('user', module, 'delete'), false, `shared deletion ${module}`);
  }
  for (const action of ['create', 'update', 'delete']) assert.equal(await permission.has('user', 'account', action), false);
  assert.equal(await permission.has('user', 'personnel-certification', 'update'), false, 'existing personnel workflow remains add-only for users');
  assigned = false;
  assert.equal(await permission.has('user', 'risk-management', 'create'), false, 'admin page assignments still apply');
});
