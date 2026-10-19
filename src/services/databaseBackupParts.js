const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const fail = message => Object.assign(new Error(message), { status: 400 });
const batchPattern = /^nist-basis-\d{8}T\d{6}Z-[a-f0-9-]{36}$/;
const archivePattern = /^nist-basis-\d{8}T\d{6}Z(?:\.(?:dump|json)|-[a-f0-9-]{36}(?:\.manifest\.json|\.dump\.part-\d+))$/;

async function splitDump(source, root, fileName, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw fail('Ambang bagian tidak valid.');
  const batchId = fileName.replace(/\.dump$/, '') + '-' + randomUUID();
  const staging = await fsp.mkdtemp(path.join(root, '.database-split-'));
  const published = [];
  try {
    const size = (await fsp.stat(source)).size, parts = [];
    const fullHash = createHash('sha256');
    for (let offset = 0; offset < size; offset += limit) {
      const name = `${batchId}.dump.part-${String(parts.length + 1).padStart(4, '0')}`;
      const hash = createHash('sha256');
      await pipeline(fs.createReadStream(source, { start: offset, end: Math.min(size, offset + limit) - 1 }), new Transform({ transform(chunk, encoding, done) { hash.update(chunk); fullHash.update(chunk); done(null, chunk); } }), fs.createWriteStream(path.join(staging, name), { flags: 'wx' }));
      parts.push({ fileName: name, size: Math.min(limit, size - offset), sha256: hash.digest('hex') });
    }
    const manifest = { format: 'NIST Basis database parts', version: 1, batchId, size, sha256: fullHash.digest('hex'), parts };
    const manifestName = `${batchId}.manifest.json`;
    await fsp.writeFile(path.join(staging, manifestName), JSON.stringify(manifest), { flag: 'wx' });
    for (const name of [...parts.map(part => part.fileName), manifestName]) {
      const target = path.join(root, name);
      await fsp.rename(path.join(staging, name), target); published.push(target);
    }
    await fsp.rm(source, { force: true });
    return { fileName: manifestName, manifestName, parts, size, partCount: parts.length };
  } catch (error) {
    await Promise.all(published.map(file => fsp.rm(file, { force: true })));
    throw error;
  } finally { await fsp.rm(staging, { recursive: true, force: true }); }
}

async function restoreParts(uploads, restore) {
  if (!Array.isArray(uploads) || !uploads.length) throw fail('Pilih manifest dan semua bagian backup.');
  let staging;
  try {
    const manifests = uploads.filter(file => file.originalname?.endsWith('.manifest.json'));
    if (manifests.length !== 1) throw fail('Pilih tepat satu manifest dan semua bagian dari batch yang sama.');
    if ((await fsp.stat(manifests[0].path)).size > 16 * 1024 * 1024) throw fail('Manifest terlalu besar.');
    let manifest;
    try { manifest = JSON.parse(await fsp.readFile(manifests[0].path, 'utf8')); } catch { throw fail('Manifest tidak valid.'); }
    if (manifest.format !== 'NIST Basis database parts' || manifest.version !== 1 || !batchPattern.test(manifest.batchId) || !Array.isArray(manifest.parts) || !manifest.parts.length || !Number.isSafeInteger(manifest.size) || manifest.size <= 0 || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw fail('Format manifest tidak valid.');
    const supplied = new Map();
    for (const file of uploads) {
      if (supplied.has(file.originalname)) throw fail('Bagian duplikat.');
      supplied.set(file.originalname, file);
    }
    if (manifests[0].originalname !== `${manifest.batchId}.manifest.json` || supplied.size !== manifest.parts.length + 1) throw fail('Bagian tidak lengkap atau tercampur batch lain.');
    let total = 0;
    for (let index = 0; index < manifest.parts.length; index++) {
      const part = manifest.parts[index];
      const expected = `${manifest.batchId}.dump.part-${String(index + 1).padStart(4, '0')}`;
      if (part.fileName !== expected || !supplied.has(expected) || !Number.isSafeInteger(part.size) || part.size <= 0 || !/^[a-f0-9]{64}$/.test(part.sha256) || (await fsp.stat(supplied.get(expected).path)).size !== part.size) throw fail('Bagian hilang atau ukuran tidak sesuai.');
      total += part.size;
    }
    if (!Number.isSafeInteger(total) || total !== manifest.size) throw fail('Ukuran total tidak sesuai.');
    staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'nist-db-join-'));
    const target = path.join(staging, 'restore.dump'), fullHash = createHash('sha256');
    for (const part of manifest.parts) {
      const hash = createHash('sha256');
      await pipeline(fs.createReadStream(supplied.get(part.fileName).path), new Transform({ transform(chunk, encoding, done) { hash.update(chunk); fullHash.update(chunk); done(null, chunk); } }), fs.createWriteStream(target, { flags: 'a' }));
      if (hash.digest('hex') !== part.sha256) throw fail('Checksum bagian tidak sesuai; backup rusak.');
    }
    if (fullHash.digest('hex') !== manifest.sha256) throw fail('Checksum database tidak sesuai.');
    // No database mutation or authentication lock until every byte is validated.
    return await restore({ path: target, originalname: `${manifest.batchId.slice(0, 27)}.dump` });
  } finally {
    await Promise.all(uploads.filter(file => file?.path).map(file => fsp.rm(file.path, { force: true })));
    if (staging) await fsp.rm(staging, { recursive: true, force: true });
  }
}
module.exports = { splitDump, restoreParts, archivePattern };
