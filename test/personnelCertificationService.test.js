const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../src/config/database');
const service = require('../src/services/personnelCertificationService');

test('certifications require a registered personnel ID, not a free-text name', async () => {
  for (const personnelId of [undefined, '', 0, -1, '1.5', 'abc']) {
    await assert.rejects(service.create({ personnelId, personnelName: 'Someone', certificationName: 'CISSP' }), { status: 400 });
    await assert.rejects(service.update(1, { personnelId, certificationName: 'CISSP' }), { status: 400 });
  }
});

test('personnel may have no supervisor but cannot supervise themselves', async () => {
  await assert.rejects(service.createOrganizationPersonnel({ personnelName: 'Manager', supervisorName: ' manager ' }), { status: 400 });
});

// Opt in with PERSONNEL_DB_TEST=1. All writes use connection-local TEMP tables;
// no application records or permanent schema objects are created or modified.
test('registered personnel workflow and legacy migration in isolated PostgreSQL TEMP tables', {
  skip: process.env.PERSONNEL_DB_TEST !== '1'
}, async t => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const client = await originalConnect.call(pool);
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
    for (const name of ['organization_personnel', 'personnel_certifications']) {
      const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
      const end = schema.indexOf('\n);', start) + 3;
      assert.ok(start >= 0 && end > start);
      await client.query(schema.slice(start, end).replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE'));
    }
    // Keep every query, including service transactions, on the isolated connection.
    await client.query('SET search_path TO pg_temp');
    pool.query = client.query.bind(client);
    pool.connect = async () => ({ query: client.query.bind(client), release() {} });

    await t.test('legacy records are linked without losing certificates; migration is idempotent', async () => {
      await client.query('ALTER TABLE personnel_certifications DROP COLUMN personnel_id');
      await client.query("INSERT INTO organization_personnel (personnel_name, employee_id, personnel_role) VALUES ('Existing Person', 'EMP1', 'Manager')");
      await client.query("INSERT INTO personnel_certifications (personnel_name, employee_id, certification_name) VALUES ('Existing Person', 'EMP1', 'Legacy A'), ('Legacy Person', 'EMP2', 'Legacy B'), ('Legacy Person', 'EMP2', 'Legacy C')");
      await service.ensureStore();
      await service.ensureStore();
      const people = await service.listOrganizationPersonnel();
      const certificates = await service.list();
      assert.equal(people.length, 2);
      assert.equal(certificates.length, 3);
      assert.equal(certificates.find(row => row.certificationName === 'Legacy B').personnelId, certificates.find(row => row.certificationName === 'Legacy C').personnelId);
      assert.ok(certificates.every(row => row.personnelId));
      await assert.rejects(client.query("INSERT INTO personnel_certifications (personnel_name, certification_name) VALUES ('Unregistered', 'Invalid')"), { code: '23502' });
    });

    let boss, employee, first, second;
    await t.test('register a top-level employee with an empty supervisor and a direct report', async () => {
      boss = await service.createOrganizationPersonnel({ personnelName: 'Top Manager', employeeId: 'BOSS', personnelRole: 'CISO', supervisorName: '' });
      assert.equal(boss.supervisorName, '');
      employee = await service.createOrganizationPersonnel({ personnelName: 'Analyst', employeeId: 'EMP3', personnelRole: 'SOC Analyst', supervisorName: boss.personnelName });
      assert.equal(employee.supervisorName, 'Top Manager');
    });

    await t.test('reject unknown personnel; identity is derived from registration', async () => {
      await assert.rejects(service.create({ personnelId: '999999', certificationName: 'CISSP' }), { status: 400 });
      first = await service.create({ personnelId: employee.id, personnelName: 'Spoofed', employeeId: 'Wrong', supervisorName: 'Wrong', certificationName: 'CISSP', issueDate: '2026-09-08', expiryDate: '2029-09-08', status: 'Active' });
      assert.equal(first.personnelName, 'Analyst');
      assert.equal(first.employeeId, 'EMP3');
      assert.equal(first.supervisorName, boss.personnelName);
      assert.equal(first.issueDate, '2026-09-08');
      assert.equal(first.expiryDate, '2029-09-08');
    });

    await t.test('one employee has multiple independently editable certifications', async () => {
      second = await service.create({ personnelId: employee.id, certificationName: 'CISM', status: 'Active' });
      assert.notEqual(first.id, second.id);
      assert.equal(first.personnelId, second.personnelId);
      await service.updateLayout(first.id, { certificationLevel: 'Advanced / Expert', positionX: 150, positionY: 90 });
      const updated = await service.update(first.id, { personnelId: employee.id, certificationName: 'CISSP renewed', certificationLevel: 'Advanced / Expert', status: 'Active' });
      assert.equal(updated.positionX, 150);
      assert.equal(updated.positionY, 90);
      assert.equal(updated.onCanvas, true);
      const rows = (await service.list()).filter(row => row.personnelId === employee.id);
      assert.equal(rows.length, 2);
      assert.ok(rows.some(row => row.certificationName === 'CISM'));
    });

    await t.test('editing employee identity updates all certificates without regrouping by name', async () => {
      await service.updateOrganizationPersonnel(employee.id, { personnelName: 'Senior Analyst', employeeId: 'EMP3', personnelRole: 'SOC Lead', supervisorName: '' });
      const rows = (await service.list()).filter(row => row.personnelId === employee.id);
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.personnelName === 'Senior Analyst' && row.supervisorName === '' && row.personnelRole === 'SOC Lead'));
      const namesake = await service.createOrganizationPersonnel({ personnelName: 'Senior Analyst', employeeId: 'EMP4' });
      const other = await service.create({ personnelId: namesake.id, certificationName: 'Security+' });
      assert.notEqual(other.personnelId, employee.id);
    });

    await t.test('employee deletion is blocked until certificates are removed or reassigned', async () => {
      await assert.rejects(service.removeOrganizationPersonnel(employee.id), { status: 409 });
      assert.equal((await service.list()).filter(row => row.personnelId === employee.id).length, 2);
      await service.remove(first.id);
      await service.update(second.id, { personnelId: boss.id, certificationName: 'CISM', status: 'Active' });
      await service.removeOrganizationPersonnel(employee.id);
      assert.ok(!(await service.listOrganizationPersonnel()).some(row => row.id === employee.id));
      assert.equal((await service.list()).find(row => row.id === second.id).personnelId, boss.id);
    });
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    // Discard this connection so its TEMP tables and search_path cannot leak.
    client.release(true);
    await pool.end();
  }
});
