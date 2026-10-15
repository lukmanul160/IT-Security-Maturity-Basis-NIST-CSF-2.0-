const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pool } = require('../src/config/database');
const service = require('../src/services/complianceEvidenceService');
const report = { title: 'Laporan', recipient: 'Regulator', recipientType: 'Regulator', owner: 'PIC', dueDate: '2026-10-15', status: 'Sudah dilaporkan' };
const file = () => ({ originalname: 'bukti.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nEvidence') });
test('evidence validates completion, file size/type and multipart JSON', () => {
  assert.equal(service.validateFiles([file()], 'Sudah dilaporkan')[0].name, 'bukti.pdf');
  assert.throws(() => service.validateFiles([file()], 'Belum dilaporkan'), { status: 400 });
  assert.throws(() => service.validateFiles([{ ...file(), buffer: Buffer.alloc(0) }], 'Sudah dilaporkan'), { status: 400 });
  assert.throws(() => service.validateFiles([{ ...file(), originalname: 'bad.html', mimetype: 'text/html' }], 'Sudah dilaporkan'), { status: 400 });
  assert.throws(() => service.parse({ data: '{broken' }), { status: 400 });
});
test('PostgreSQL evidence is atomic, downloadable, retained on edits and removed with report', async () => {
  const client = await pool.connect(), query = pool.query, connect = pool.connect;
  try {
    await client.query(fs.readFileSync('database/compliance.sql', 'utf8').replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE'));
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    const saved = await service.save(null, { data: JSON.stringify(report) }, [file()]);
    const files = await service.list(saved.id);
    assert.equal(files.length, 1);
    assert.deepEqual((await service.download(saved.id, files[0].id)).content, file().buffer);
    await service.save(saved.id, { ...report, notes: 'Updated' }, []);
    assert.equal((await service.list(saved.id)).length, 1);
    await assert.rejects(service.save(saved.id, report, Array.from({ length: 10 }, file)), { status: 400 });
    assert.equal((await service.list(saved.id)).length, 1);
    await service.remove(saved.id, files[0].id);
    await assert.rejects(service.download(saved.id, files[0].id), { status: 404 });
    await service.save(saved.id, report, [file()]);
    await client.query('DELETE FROM compliance_reports WHERE id=$1', [saved.id]);
    assert.equal((await service.list(saved.id)).length, 0);
  } finally { pool.query = query; pool.connect = connect; client.release(true); }
});
test.after(() => pool.end());
