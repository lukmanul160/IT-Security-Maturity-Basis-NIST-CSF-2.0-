// Validate the actual PostgreSQL generated-column constraint using temporary tables.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pool } = require('../src/config/database');
async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE vendor_fk_test (id BIGINT PRIMARY KEY) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE asset_fk_test (id BIGINT PRIMARY KEY, data JSONB NOT NULL) ON COMMIT DROP');
    const source = fs.readFileSync('src/services/assetManagementService.js', 'utf8');
    const ddl = source.match(/ALTER TABLE managed_assets ADD COLUMN IF NOT EXISTS managed_vendor_id[^;]+;/)[0]
      .replace('managed_assets', 'asset_fk_test').replace('tprm_risk_register', 'vendor_fk_test');
    await client.query(ddl);
    await client.query('INSERT INTO vendor_fk_test VALUES (10)');
    await client.query('INSERT INTO asset_fk_test VALUES (1, $1), (2, $2)', [{ managedVendorId: '10' }, { managedVendorId: null }]);
    assert.deepEqual((await client.query('SELECT managed_vendor_id FROM asset_fk_test ORDER BY id')).rows.map(r => r.managed_vendor_id), ['10', null]);
    async function rejected(sql, params, code) {
      await client.query('SAVEPOINT fk_case');
      await assert.rejects(client.query(sql, params), error => error.code === code);
      await client.query('ROLLBACK TO SAVEPOINT fk_case');
    }
    await rejected('INSERT INTO asset_fk_test VALUES (3, $1)', [{ managedVendorId: '999' }], '23503');
    await rejected('UPDATE asset_fk_test SET data=$1 WHERE id=2', [{ managedVendorId: '999' }], '23503');
    await rejected('DELETE FROM vendor_fk_test WHERE id=10', [], '23001');
    await client.query('UPDATE asset_fk_test SET data=$1 WHERE id=1', [{ managedVendorId: null }]);
    assert.equal((await client.query('DELETE FROM vendor_fk_test WHERE id=10')).rowCount, 1);
    await client.query('ROLLBACK');
    console.log('PASS: generated vendor FK rejects orphan insert/update and referenced deletion; nullable vendor and explicit unlink allow deletion. Temporary tables only.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
