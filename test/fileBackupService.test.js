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
test('folder backup includes descendants and excludes folders with similar names', async t => {
  const rows = ['Policy/a.pdf', 'Policy/2026/b.pdf', 'Policy-old/c.pdf', 'root.pdf'].map(key => ({ path: key, name: 'file.pdf', mime_type: 'application/pdf' }));
  const read = [];
  const { api } = await fixture(t, async key => { read.push(key); return Buffer.from('x'); }, rows);
  assert.deepEqual(await api.folders(), ['Policy', 'Policy-old', 'Policy/2026']);
  const backup = await api.create({ folder: 'Policy' });
  assert.equal(backup.fileCount, 2);
  assert.deepEqual(read, ['Policy/a.pdf', 'Policy/2026/b.pdf']);
  await assert.rejects(api.create({ folder: '../Policy' }), /Invalid file path/);
  await assert.rejects(api.create({ folder: 'missing' }), /tidak berisi/);
});
test('folder restore changes only descendants and rejects missing folders without writes', async t => {
  const files = ['Policy/a.pdf', 'Policy/2026/b.pdf', 'Policy-old/c.pdf'].map(key => ({ path: key, name: 'file.pdf', mime_type: 'application/pdf', size: 1 }));
  const manifest = { format: 'NIST Basis file backup', version: 1, files };
  const entries = files.map(item => [`upload/${item.path}`, 'x']);
  const written = [];
  const api = createFileBackupService({ db: { query: async () => ({ rows: [] }) }, store: { normalizePath, put: async key => written.push(key) } });
  const result = await api.restore({ path: await recoveryZip(t, manifest, entries) }, { folder: 'Policy' });
  assert.equal(result.fileCount, 2);
  assert.deepEqual(written, ['Policy/a.pdf', 'Policy/2026/b.pdf']);
  written.length = 0;
  await assert.rejects(api.restore({ path: await recoveryZip(t, manifest, entries) }, { folder: 'missing' }), /tidak ditemukan/);
  assert.deepEqual(written, []);
});
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

async function batchFixture(t, rows, contents) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-batch-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const writes = [];
  const db = { query: async sql => ({ rows: sql.startsWith('SELECT path,') ? rows : [{ id: 7 }] }) };
  const store = { normalizePath,
    openRead: async key => require('node:stream').Readable.from((function* () { const content = contents.get(key); for (let i = 0; i < content.length; i += 1024) yield content.subarray(i, i + 1024); })()),
    read: async () => { throw new Error('Backup must use streaming'); },
    put: async (key, data) => writes.push({ key, content: await fs.readFile(data.sourcePath), owner: data.uploadedBy }),
  };
  const api = createFileBackupService({ root, db, store, partLimit: 64 * 1024 });
  async function uploads(parts) { const result = []; for (const part of parts) { const target = path.join(root, `upload-${require('node:crypto').randomUUID()}.zip`); await fs.copyFile(await api.resolve(part.fileName), target); result.push({ path: target, originalname: part.fileName }); } return result; }
  return { api, root, writes, uploads };
}
test('batch backup streams a large single file across parts and restores in arbitrary order', async t => {
  const binary = require('node:crypto').randomBytes(190 * 1024);
  const rows = [{ path: 'Knowledge Notes/large.bin', name: 'large.bin', mime_type: 'application/octet-stream', uploaded_by: 7, open_page: 2 }, { path: 'Policy/empty.txt', name: 'empty.txt', mime_type: 'text/plain' }];
  const f = await batchFixture(t, rows, new Map([[rows[0].path, binary], [rows[1].path, Buffer.alloc(0)]]));
  const result = await f.api.create({ folder: ['Knowledge Notes', 'Policy'] });
  assert.equal(result.fileCount, 2); assert.equal(result.totalSize, binary.length);
  assert.ok(result.parts.length > 2); assert.ok(result.parts.every(part => part.size <= 64 * 1024));
  assert.equal((await f.api.list()).length, result.parts.length);
  const input = await f.uploads([...result.parts].reverse());
  assert.equal((await f.api.restore(input, { folder: ['Knowledge Notes', 'Policy'] })).fileCount, 2);
  assert.deepEqual(f.writes.find(item => item.key === rows[0].path).content, binary);
  assert.equal(f.writes.find(item => item.key === rows[0].path).owner, 7);
  assert.equal(f.writes.find(item => item.key === rows[1].path).content.length, 0);
  for (const file of input) await assert.rejects(fs.stat(file.path), { code: 'ENOENT' });
});
test('incomplete, duplicate and mixed backup parts fail before any storage write', async t => {
  const row = { path: 'Policy/large.bin', name: 'large.bin', mime_type: 'application/octet-stream' };
  const f = await batchFixture(t, [row], new Map([[row.path, require('node:crypto').randomBytes(140 * 1024)]]));
  const first = await f.api.create(), second = await f.api.create();
  await assert.rejects(f.api.restore(await f.uploads(first.parts.slice(1))), /belum lengkap/);
  await assert.rejects(f.api.restore(await f.uploads([first.parts[0], first.parts[0], ...first.parts.slice(2)])), /duplikat/);
  await assert.rejects(f.api.restore(await f.uploads([second.parts[0], ...first.parts.slice(1)])), /berbeda/);
  assert.deepEqual(f.writes, []);
});
test('batch restore folder selection restores only selected descendants', async t => {
  const rows = ['Policy/large.bin', 'Asset Management/large.bin'].map(key => ({ path: key, name: 'large.bin', mime_type: 'application/octet-stream' }));
  const f = await batchFixture(t, rows, new Map(rows.map(row => [row.path, Buffer.alloc(90 * 1024, 42)])));
  const result = await f.api.create();
  assert.equal((await f.api.restore(await f.uploads(result.parts), { folder: 'Policy' })).fileCount, 1);
  assert.deepEqual(f.writes.map(item => item.key), ['Policy/large.bin']);
});
test('stream failure removes every staged or published batch part', async t => {
  const f = await batchFixture(t, [{ path: 'Policy/fail.bin', name: 'fail.bin', mime_type: 'application/octet-stream' }], new Map());
  await assert.rejects(f.api.create()); assert.deepEqual(await fs.readdir(f.root), []);
});

test('administrator batch restore route receives multiple staged ZIPs and folder selection', async t => {
  t.mock.method(require('../src/services/websiteSettingsService'), 'read', async () => ({}));
  const service = require('../src/services/fileBackupService');
  let received;
  t.mock.method(service, 'restore', async (files, options) => {
    received = { files, options, bytes: await Promise.all(files.map(file => fs.readFile(file.path, 'utf8'))) };
    for (const file of files) await fs.rm(file.path, { force: true });
    return { restored: true, fileCount: 2, partCount: files.length };
  });
  const app = require('express')();
  app.use((req, res, next) => { req.user = { role: 'admin' }; next(); });
  app.use('/file-backups', require('../src/routes/fileBackupRoutes'));
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const body = new FormData(); body.append('backups', new Blob(['first']), 'part-1.zip'); body.append('backups', new Blob(['second']), 'part-2.zip'); body.append('folder', 'Policy');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/file-backups/restore-batch`, { method: 'POST', body });
  assert.equal(response.status, 200); assert.equal((await response.json()).partCount, 2);
  assert.deepEqual(received.bytes, ['first', 'second']); assert.equal(received.options.folder, 'Policy');
  for (const file of received.files) await assert.rejects(fs.stat(file.path), { code: 'ENOENT' });
});

test('missing physical files without database bytes are reported explicitly in backup and restore', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-missing-backup-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
 const rows = ['Policy/present.txt', 'Policy/missing.pdf'].map(key => ({ path: key, name: path.basename(key), mime_type: 'application/octet-stream' }));
 const writes=[];
 const api = createFileBackupService({ root, db: { query: async sql => ({ rows: sql.startsWith('SELECT path,') ? rows : [] }) }, store: { normalizePath,
  read: async key => { if(key.endsWith('missing.pdf'))throw Object.assign(new Error('missing'),{code:'ENOENT'});return Buffer.from('available'); },
  put: async key => writes.push(key),
 } });
 const result=await api.create();assert.equal(result.complete,false);assert.equal(result.fileCount,1);assert.equal(result.missingFiles.length,1);assert.equal(result.missingFiles[0].path,'Policy/missing.pdf');
 const zip=XLSX.CFB.read(await fs.readFile(await api.resolve(result.fileName)),{type:'buffer'});
 const manifest=JSON.parse(Buffer.from(zip.FileIndex[zip.FullPaths.findIndex(name=>name.endsWith('/manifest.json'))].content).toString());
 assert.equal(manifest.complete,false);assert.deepEqual(manifest.missingFiles,result.missingFiles);
 const input=path.join(root,'restore.zip');await fs.copyFile(await api.resolve(result.fileName),input);
 const restored=await api.restore({path:input,originalname:result.fileName});assert.equal(restored.fileCount,1);assert.equal(restored.missingFiles.length,1);assert.deepEqual(writes,['Policy/present.txt']);
});


test('inspection derives parents and children from backup, cleans uploads and never writes live storage', async t => {
  const { api, root } = await fixture(t, async () => Buffer.from('original'), [
    { path: 'Absent/Child/Grandchild/item.pdf', name: 'item.pdf', mime_type: 'application/pdf' },
    { path: 'root.pdf', name: 'root.pdf', mime_type: 'application/pdf' }
  ]);
  const backup = await api.create();
  const input = path.join(root, 'inspection.zip');
  await fs.copyFile(await api.resolve(backup.fileName), input);
  const recovery = createFileBackupService({ root, db: { query() { throw Error('No DB access during inspection'); } }, store: { normalizePath, put() { throw Error('No live writes during inspection'); } } });
  assert.deepEqual(await recovery.inspect([{ path: input }]), { folders: ['Absent', 'Absent/Child', 'Absent/Child/Grandchild'] });
  await assert.rejects(fs.stat(input), { code: 'ENOENT' });
});


test('multiple folder backup and restore select the union without duplicate files', async t => {
  const rows = ['Policy/a.pdf', 'Policy/2026/b.pdf', 'Notes/n.pdf', 'Other/x.pdf'].map(path => ({ path, name: 'file.pdf', mime_type: 'application/pdf' }));
  const { api, root } = await fixture(t, async key => Buffer.from(key), rows);
  const backup = await api.create({ folder: ['Policy', 'Policy/2026', 'Notes'] });
  assert.equal(backup.fileCount, 3);
  const input = path.join(root, 'multi-restore.zip');
  await fs.copyFile(await api.resolve(backup.fileName), input);
  const written = [];
  const recovery = createFileBackupService({ root, db: { query: async () => ({ rows: [] }) }, store: { normalizePath, put: async key => written.push(key) } });
  assert.equal((await recovery.restore({ path: input }, { folder: ['Policy/2026', 'Notes'] })).fileCount, 2);
  assert.deepEqual(written.sort(), ['Notes/n.pdf', 'Policy/2026/b.pdf']);
  await assert.rejects(api.create({ folder: [] }), /Pilih setidaknya/);
  await assert.rejects(api.create({ folder: ['Policy', '../secret'] }), /Invalid file path/);
});
