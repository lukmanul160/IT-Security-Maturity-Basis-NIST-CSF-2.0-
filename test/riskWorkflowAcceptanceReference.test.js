const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rules = require('../src/services/riskWorkflowRules');

// Load the real service against a transaction fixture without importing database/env.
function fixture(form) {
  const calls = [];
  const previous = { ...rules.initial(), version: 0 };
  const client = { release() {}, async query(sql, args) {
    calls.push({ sql, args });
    if (sql.startsWith('SELECT * FROM risk_register')) return { rows: [{ risk_id: 'R-1' }] };
    if (sql.startsWith('SELECT data, version')) return { rows: [{ data: previous, version: 0 }] };
    if (sql.startsWith('SELECT * FROM risk_acceptance_forms')) return { rows: form ? [form] : [] };
    return { rows: [] };
  }};
  const pool = { connect: async () => client, query: client.query.bind(client) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/riskWorkflowService'), 'utf8'), {
    module, exports: module.exports, require(name) {
      if (name === '../config/database') return { pool };
      if (name === './permissionService') return { has: async () => true };
      if (name === './riskWorkflowRules') return rules;
      if (name === 'node:crypto') return require(name);
      throw new Error('Unexpected dependency: ' + name);
    }
  });
  return { service: module.exports, calls };
}
test('missing acceptance form fails draft save with recovery instructions and rolls back', async () => {
  const { service, calls } = fixture(null);
  await assert.rejects(service.mutate('R-1', { version: 0, acceptanceFormId: 12 }, { username: 'editor' }, 'save'), error => {
    assert.equal(error.status, 400);
    assert.match(error.message, /RAF-00012/);
    assert.match(error.message, /simpan form terlebih dahulu/);
    return true;
  });
  assert.ok(calls.some(call => call.sql === 'ROLLBACK'));
  assert.equal(calls.some(call => call.sql.startsWith('INSERT')), false);
});
test('existing unsigned form can be saved as draft', async () => {
  const { service, calls } = fixture({ id: 12 });
  await service.mutate('R-1', { version: 0, acceptanceFormId: 12 }, { username: 'editor' }, 'save');
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});
test('draft without acceptance reference does not query acceptance forms', async () => {
  const { service, calls } = fixture(null);
  await service.mutate('R-1', { version: 0 }, { username: 'editor' }, 'save');
  assert.equal(calls.some(call => call.sql.includes('FROM risk_acceptance_forms')), false);
});
