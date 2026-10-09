const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');
const risk = require('../src/services/riskManagementService');
const tprm = require('../src/services/tprmService');
const fs = require('node:fs');
const vm = require('node:vm');

test('risk reset uses one checked-out connection and rolls back all related writes on failure', async () => {
  const original = { query: pool.query, connect: pool.connect };
  const calls = [];
  let fail = false;
  pool.query = async () => { throw Error('Transaction escaped its connection'); };
  pool.connect = async () => ({
    release() { calls.push('release'); },
    async query(sql) { calls.push(sql); if (fail && sql === 'DELETE FROM risk_dropdown_options') throw Error('simulated failure'); return { rows: [] }; }
  });
  try {
    await risk.resetRegister();
    assert.equal(calls[0], 'BEGIN');
    assert.equal(calls.at(-2), 'COMMIT');
    assert.equal(calls.at(-1), 'release');
    calls.length = 0; fail = true;
    await assert.rejects(risk.resetRegister(), /simulated failure/);
    assert.equal(calls.at(-2), 'ROLLBACK');
    assert.equal(calls.at(-1), 'release');
    assert.equal(calls.includes('COMMIT'), false);
  } finally { pool.query = original.query; pool.connect = original.connect; }
});

test('TPRM deletion reports an asset foreign-key conflict instead of an internal server error', async () => {
  const query = pool.query;
  let code = '23503';
  pool.query = async () => { throw Object.assign(Error('foreign key violation'), { code }); };
  try { for (code of ['23503', '23001']) await assert.rejects(tprm.remove('1'), error => error.status === 409 && /Vendor masih digunakan/.test(error.message)); }
  finally { pool.query = query; }
});

test('legacy certification status cannot escape an HTML class attribute to inject an event handler', () => {
  const source = fs.readFileSync('frontend/client/src/workspace/features/personnel/organization-and-forms.js', 'utf8');
  const declaration = source.split('\n').find(line => line.startsWith('function certificationCard('));
  const context = vm.createContext({ escapeHtml: text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])) });
  vm.runInContext(declaration, context);
  context.row = { id: '1', certificationName: 'Test', personnelName: 'Person', status: 'x"\tonmouseover="alert(1)' };
  const output = vm.runInContext('certificationCard(row)', context);
  assert.match(output, /class="certification-card-status status-[a-z0-9_-]+"/);
  assert.equal(/\s(?:onmouseover|onclick|onerror)="/.test(output), false);
  context.row.status = 'Active';
  assert.match(vm.runInContext('certificationCard(row)', context), /status-active/);
});

test('TPRM vendor and related risks save atomically and roll back the vendor when link writes fail', async () => {
  const original = { query: pool.query, connect: pool.connect };
  const calls = [];
  let fail = false;
  pool.query = async () => { throw Error('Write escaped TPRM transaction'); };
  pool.connect = async () => ({
    release() { calls.push('release'); },
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT vendor_name')) return { rows: [{ vendor_name: 'Demo' }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO tprm_risk_register')) return { rows: [{ id: '1', third_party: 'Demo' }], rowCount: 1 };
      if (fail && sql.startsWith('DELETE FROM tprm_related_risks')) throw Error('link write failed');
      return { rows: [], rowCount: 1 };
    }
  });
  try {
    const data = { thirdParty: 'Demo', serviceDependency: 'Hosting', questionnaireId: 1, riskRegisterIds: ['CSR - 001'] };
    await tprm.create(data);
    assert.equal(calls[0], 'BEGIN');
    assert.equal(calls.at(-2), 'COMMIT');
    assert.equal(calls.at(-1), 'release');
    fail = true; calls.length = 0;
    await assert.rejects(tprm.create(data), /link write failed/);
    assert.equal(calls.at(-2), 'ROLLBACK');
    assert.equal(calls.at(-1), 'release');
    assert.equal(calls.includes('COMMIT'), false);
  } finally { pool.query = original.query; pool.connect = original.connect; }
});
