// Isolated full-size boundary test; never writes application data or production storage.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const { createFileBackupService, MAX_PART_BYTES } = require('../src/services/fileBackupService');
const { normalizePath } = require('../src/services/storageService');
(async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-large-backup-test-'));
 try {
  const size = 501 * 1024 * 1024, block = Buffer.alloc(1024 * 1024, 173);
  const expected = createHash('sha256'); let verified = 0;
  const row = { path: 'Knowledge Notes/large.bin', name: 'large.bin', mime_type: 'application/octet-stream' };
  const store = { normalizePath,
   openRead: async () => Readable.from((async function* () { for (let i = 0; i < 501; i++) { expected.update(block); yield block; } })()),
   put: async (key, file) => {
    assert.equal(key, row.path); const actual = createHash('sha256');
    for await (const bytes of require('node:fs').createReadStream(file.sourcePath)) { verified += bytes.length; actual.update(bytes); }
    assert.equal(actual.digest('hex'), expected.digest('hex'));
   },
  };
  const api = createFileBackupService({ root, store, db: { query: async sql => ({ rows: sql.startsWith('SELECT path,') ? [row] : [] }) } });
  const result = await api.create(); assert.equal(result.totalSize, size); assert.equal(result.parts.length, 2);
  assert.ok(result.parts.every(part => part.size <= MAX_PART_BYTES));
  const inputs = [];
  for (const part of [...result.parts].reverse()) { const target = path.join(root, `restore-${inputs.length}.zip`); await fs.copyFile(await api.resolve(part.fileName), target); inputs.push({ path: target, originalname: part.fileName }); }
  const restored = await api.restore(inputs); assert.equal(restored.fileCount, 1); assert.equal(verified, size);
  console.log(`PASS real 501 MiB single-file backup/restore: ${result.parts.length} parts, SHA-256 matches, ${verified} bytes restored`);
 } finally {
  const resolved = path.resolve(root); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('nist-large-backup-test-'));
  await fs.rm(resolved, { recursive: true, force: true });
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
