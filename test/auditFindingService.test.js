const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/auditFindingService');
const { pool } = require('../src/config/database');
test('validates required fields, statuses, severity and calendar dates', () => {
  assert.equal(service.normalize('audit', { title: ' Test ' }).title, 'Test');
  for (const data of [{ title: '' }, { title: 'Test', status: 'Unknown' }, { title: 'Test', severity: 'Unknown' }, { title: 'Test', dueDate: '2026-02-30' }]) assert.throws(() => service.normalize('finding', data), { status: 400 });
  assert.throws(() => service.normalize('unknown', { title: 'Test' }), { status: 400 });
});
test('tracker permission preserves role boundaries', () => {
  const { canAccess } = require('../src/services/permissionService');
  assert.equal(canAccess('viewer', 'audit-finding-tracker', 'read'), true);
  assert.equal(canAccess('viewer', 'audit-finding-tracker', 'create'), false);
  assert.equal(canAccess('editor', 'audit-finding-tracker', 'update'), true);
  assert.equal(canAccess('editor', 'audit-finding-tracker', 'delete'), false);
});
test('PostgreSQL hierarchy, binary evidence, update and protected deletion', { skip: process.env.RUN_AFT_DB_TESTS !== '1' }, async t => {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TEMP TABLE audit_finding_records(id UUID PRIMARY KEY, kind TEXT NOT NULL, parent_id UUID REFERENCES audit_finding_records(id) ON DELETE RESTRICT, data JSONB NOT NULL, filename TEXT, content BYTEA, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    t.mock.method(pool, 'query', client.query.bind(client));
    t.mock.method(pool, 'connect', async () => ({ query: client.query.bind(client), release() {} }));
    const audit = await service.save('audit', null, null, { title: 'Audit test' });
    await assert.rejects(service.save('followup', null, audit.id, { title: 'Invalid hierarchy' }), { status: 400 });
    const finding = await service.save('finding', null, audit.id, { title: 'Finding test' });
    const followup = await service.save('followup', null, finding.id, { title: 'Action test' });
    await assert.rejects(service.save('evidence', null, followup.id, { title: 'Missing file' }), { status: 400 });
    const file = { originalname: 'proof.txt', buffer: Buffer.from('proof'), size: 5 };
    const evidence = await service.save('evidence', null, followup.id, { title: 'Proof' }, file);
    assert.deepEqual((await service.download(evidence.id)).content, file.buffer);
    await service.save('evidence', evidence.id, audit.id, { title: 'Updated' });
    assert.deepEqual((await service.download(evidence.id)).content, file.buffer);
    assert.equal((await service.list()).find(r => r.id === evidence.id).parentId, followup.id);
    await assert.rejects(service.remove(audit.id), { status: 409 });
    for (const row of [evidence, followup, finding, audit]) await service.remove(row.id);
    assert.equal((await service.list()).length, 0);
  } finally { await client.query('DROP TABLE IF EXISTS pg_temp.audit_finding_records'); client.release(); await pool.end(); }
});
