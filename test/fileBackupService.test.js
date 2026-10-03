const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const { createFileBackupService } = require('../src/services/fileBackupService');
const { normalizePath } = require('../src/services/storageService');

async function fixture(t, read, rows = [{ path: 'Policy/test.pdf', name: 'test.pdf', mime_type: 'application/pdf' }]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-file-backup-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const api = createFileBackupService({ root, db: { query: async sql => ({ rows: sql.includes('SELECT content') ? [{ content: Buffer.from('legacy') }] : rows }) }, store: { normalizePath, read } });
  return { api, root };
}
test('ZIP preserves uploaded paths, binary contents and metadata, and supports list/download/delete', async t => {
  const binary = Buffer.from([0, 1, 128, 255]);
  const { api } = await fixture(t, async () => binary);
  const result = await api.create();
  const zip = XLSX.CFB.read(await fs.readFile(await api.resolve(result.fileName)), { type: 'buffer' });
  const entry = zip.FileIndex[zip.FullPaths.findIndex(name => name.endsWith('/upload/Policy/test.pdf'))];
  assert.deepEqual(Buffer.from(entry.content), binary);
  const manifestEntry = zip.FileIndex[zip.FullPaths.findIndex(name => name.endsWith('/manifest.json'))];
  const manifest = JSON.parse(Buffer.from(manifestEntry.content).toString());
  assert.equal(manifest.files[0].path, 'Policy/test.pdf');
  assert.equal(result.fileCount, 1);
  assert.equal((await api.list()).length, 1);
  await api.remove(result.fileName);
  assert.deepEqual(await api.list(), []);
});
test('unreadable storage fails without leaving a partial or published backup', async t => {
  const { api, root } = await fixture(t, async () => { throw new Error('storage offline'); });
  await assert.rejects(api.create(), /storage offline/);
  assert.deepEqual(await fs.readdir(root), []);
});
test('legacy database file contents are included when disk copy is missing', async t => {
  const { api } = await fixture(t, async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
  assert.equal((await api.create()).fileCount, 1);
});
test('archive paths reject traversal, and empty libraries produce a valid archive', async t => {
  const { api } = await fixture(t, async () => Buffer.alloc(0), []);
  await assert.rejects(api.resolve('../secret.zip'), error => error.status === 400);
  assert.equal((await api.create()).fileCount, 0);
});
test('file backup routes reject non-admin roles for every archive action', async t => {
  const app = require('express')();
  app.use((req, res, next) => { req.user = { role: 'viewer' }; next(); });
  app.use('/file-backups', require('../src/routes/fileBackupRoutes'));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/file-backups`;
  for (const [method, suffix] of [['GET', ''], ['POST', ''], ['POST', '/restore'], ['GET', '/archive.zip'], ['DELETE', '/archive.zip']]) {
    assert.equal((await fetch(base + suffix, { method })).status, 403);
  }
});
test('restore round trip preserves content, paths, owner and PDF page through active storage', async t => {
  const { api, root } = await fixture(t, async () => Buffer.from('PDF content'), [{ path: 'Policy/test.pdf', name: 'test.pdf', mime_type: 'application/pdf', open_page: 3, uploaded_by: 7 }]);
  const backup = await api.create();
  const input = path.join(root, 'restore.zip');
  await fs.copyFile(await api.resolve(backup.fileName), input);
  const written = [];
  const queries = [];
  const recovery = createFileBackupService({ root, db: { query: async (sql, args) => { queries.push({ sql, args }); return { rows: [{ id: 7 }] }; } }, store: { normalizePath, put: async (key, file) => { written.push({ key, file, content: await fs.readFile(file.sourcePath) }); } } });
  const result = await recovery.restore({ path: input, originalname: backup.fileName });
  assert.equal(result.fileCount, 1);
  assert.equal(written[0].key, 'Policy/test.pdf');
  assert.equal(written[0].content.toString(), 'PDF content');
  assert.equal(written[0].file.uploadedBy, 7);
  assert.deepEqual(queries[1].args, [3, 7, 'Policy/test.pdf']);
  await assert.rejects(fs.stat(input), { code: 'ENOENT' });
});
async function recoveryZip(t, manifest, contentEntries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-recovery-zip-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'input.zip');
  const zip = require('archiver')('zip');
  const output = require('node:fs').createWriteStream(target);
  const done = require('node:stream/promises').finished(output);
  zip.pipe(output);
  zip.append(JSON.stringify(manifest), { name: 'manifest.json' });
  for (const [name, content] of contentEntries) zip.append(content, { name });
  await zip.finalize();
  await done;
  return target;
}
test('restore rejects missing files and incorrect sizes before writing any live files', async t => {
  for (const size of [1, 3]) {
    const input = await recoveryZip(t, { format: 'NIST Basis file backup', version: 1, files: [{ path: 'test.pdf', name: 'test.pdf', mime_type: 'application/pdf', size }] }, size === 1 ? [] : [['upload/test.pdf', 'x']]);
    let writes = 0;
    const api = createFileBackupService({ store: { normalizePath, put: async () => { writes++; } } });
    await assert.rejects(api.restore({ path: input }), /manifest/);
    assert.equal(writes, 0);
    await assert.rejects(fs.stat(input), { code: 'ENOENT' });
  }
});
test('restore rejects manifest traversal without modifying storage', async t => {
  const input = await recoveryZip(t, { format: 'NIST Basis file backup', version: 1, files: [{ path: '../escape', size: 1 }] }, []);
  const api = createFileBackupService({ store: { normalizePath, put: async () => assert.fail('unexpected write') } });
  await assert.rejects(api.restore({ path: input }), /Invalid file path/);
});
test('restore reports partial progress when storage fails and cleans uploaded archive', async t => {
  const files = ['a.pdf', 'b.pdf'].map(name => ({ path: name, name, mime_type: 'application/pdf', size: 1 }));
  const input = await recoveryZip(t, { format: 'NIST Basis file backup', version: 1, files }, files.map(item => [`upload/${item.path}`, 'x']));
  let writes = 0;
  const api = createFileBackupService({ db: { query: async () => ({ rows: [] }) }, store: { normalizePath, put: async () => { if (++writes === 2) throw new Error('storage offline'); } } });
  await assert.rejects(api.restore({ path: input }), /setelah 1 file.*storage offline/);
  await assert.rejects(fs.stat(input), { code: 'ENOENT' });
});
test('restore rejects corrupt CRC before changing live storage', async t => {
  const input = await recoveryZip(t, { format: 'NIST Basis file backup', version: 1, files: [{ path: 'a.pdf', name: 'a.pdf', mime_type: 'application/pdf', size: 1 }] }, [['upload/a.pdf', 'x']]);
  const bytes = await fs.readFile(input);
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const offset = bytes.indexOf(signature);
  assert.ok(offset >= 0);
  bytes.writeUInt32LE((bytes.readUInt32LE(offset + 16) ^ 1) >>> 0, offset + 16);
  await fs.writeFile(input, bytes);
  const api = createFileBackupService({ store: { normalizePath, put: async () => assert.fail('unexpected write') } });
  await assert.rejects(api.restore({ path: input }), /checksum/);
});
