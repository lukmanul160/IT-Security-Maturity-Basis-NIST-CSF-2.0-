const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { splitDump, restoreParts, archivePattern } = require('../src/services/databaseBackupParts');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-db-parts-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'nist-basis-20261019T000000Z.dump');
  const bytes = randomBytes(100003); await fs.writeFile(source, bytes);
  const result = await splitDump(source, root, path.basename(source), 16384);
  const uploads = async () => {
    const files = [];
    for (const name of [result.manifestName, ...result.parts.map(part => part.fileName)]) {
      const target = path.join(root, `upload-${files.length}-${Date.now()}`);
      await fs.copyFile(path.join(root, name), target); files.push({ path: target, originalname: name });
    }
    return files;
  };
  return { root, source, bytes, result, uploads };
}
test('split respects threshold and restores unordered parts byte for byte only after validation', async t => {
  const f = await fixture(t); assert.equal(f.result.partCount, 7);
  assert.ok(f.result.parts.every(part => part.size <= 16384 && archivePattern.test(part.fileName)));
  assert.ok(archivePattern.test(f.result.manifestName));
  await assert.rejects(fs.stat(f.source), { code: 'ENOENT' });
  const uploads = await f.uploads(); let restored = 0;
  const result = await restoreParts(uploads.reverse(), async file => {
    assert.equal(file.originalname, 'nist-basis-20261019T000000Z.dump');
    assert.deepEqual(await fs.readFile(file.path), f.bytes); restored++; return { restored: true };
  });
  assert.equal(restored, 1); assert.equal(result.restored, true);
  for (const file of uploads) await assert.rejects(fs.stat(file.path), { code: 'ENOENT' });
});
for (const condition of ['missing', 'duplicate', 'corrupt', 'mixed', 'traversal', 'total-hash']) {
  test(`rejects ${condition} parts before any database restore and cleans uploaded files`, async t => {
    const f = await fixture(t); const files = await f.uploads(); const originals = [...files];
    if (condition === 'missing') { const missing = files.pop(); await fs.rm(missing.path); }
    if (condition === 'duplicate') files.push(files[1]);
    if (condition === 'corrupt') { const handle = await fs.open(files[1].path, 'r+'); try { await handle.write(Buffer.from('bad')); } finally { await handle.close(); } }
    if (condition === 'mixed') files[1].originalname = files[1].originalname.replace('20261019', '20261020');
    if (condition === 'traversal' || condition === 'total-hash') {
      const manifest = JSON.parse(await fs.readFile(files[0].path));
      if (condition === 'traversal') manifest.parts[0].fileName = '../secret';
      else manifest.sha256 = '0'.repeat(64);
      await fs.writeFile(files[0].path, JSON.stringify(manifest));
    }
    let calls = 0;
    await assert.rejects(restoreParts(files, async () => { calls++; }));
    assert.equal(calls, 0);
    for (const file of originals) await assert.rejects(fs.stat(file.path), { code: 'ENOENT' });
  });
}
test('failed restore cleans uploads and joined temporary dump', async t => {
  const f = await fixture(t); const uploads = await f.uploads(); let joined;
  await assert.rejects(restoreParts(uploads, async file => { joined = file.path; throw Error('database offline'); }), /offline/);
  await assert.rejects(fs.stat(joined), { code: 'ENOENT' });
  for (const file of uploads) await assert.rejects(fs.stat(file.path), { code: 'ENOENT' });
});

test('administrator batch endpoint accepts manifest and unordered parts and restores their original contents', async t => {
  const f = await fixture(t);
  const express = require('express');
  const service = require('../src/services/backupService');
  t.mock.method(service, 'restoreBackupParts', uploads => restoreParts(uploads, async file => {
    assert.deepEqual(await fs.readFile(file.path), f.bytes);
    return { restored: true, fileName: file.originalname };
  }));
  const app = express();
  app.use((req, res, next) => { req.user = { role: 'admin', username: 'test' }; next(); });
  app.use('/api/backups', require('../src/routes/backupRoutes'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const body = new FormData();
  for (const name of [...f.result.parts.map(part => part.fileName).reverse(), f.result.manifestName]) body.append('backups', new Blob([await fs.readFile(path.join(f.root, name))]), name);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/backups/restore-batch`, { method: 'POST', body });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { restored: true, fileName: 'nist-basis-20261019T000000Z.dump' });
});
