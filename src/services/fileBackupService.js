const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { finished, pipeline } = require('node:stream/promises');
const archiver = require('archiver');
const yauzl = require('yauzl');
const crc32 = require('crc-32');
const { pool } = require('../config/database');
const storage = require('./storageService');
const { backupRoot } = require('../config/paths');
const MAX_PART_BYTES = 500 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { status: 400 });
async function cleanup(directory) {
  const relative = path.relative(os.tmpdir(), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid recovery directory');
  await fs.promises.rm(directory, { recursive: true, force: true });
}
async function writeZip(target, manifest, entries) {
  const output = fs.createWriteStream(target, { flags: 'wx' });
  const archive = archiver('zip', { zlib: { level: 1 } });
  const done = finished(output); done.catch(() => {});
  archive.on('error', error => output.destroy(error));
  archive.on('warning', error => output.destroy(error));
  archive.pipe(output);
  try {
    archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
    for (const entry of entries) archive.file(entry.target, { name: entry.entry });
    await archive.finalize(); await done;
  } catch (error) { archive.abort(); output.destroy(); await done.catch(() => {}); throw error; }
}
async function extract(file, staging, index, normalizePath, partLimit) {
  const zip = await new Promise((resolve, reject) => yauzl.open(file.path, { lazyEntries: true, strictFileNames: true }, (error, value) => error ? reject(invalid('Arsip ZIP tidak valid.')) : resolve(value)));
  const entries = new Map(); let total = 0, detectedVersion;
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', entry => {
        (async () => {
          const name = entry.fileName;
          if (entries.has(name) || (entry.generalPurposeBitFlag & 1) || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw invalid('Arsip berisi entri duplikat, terenkripsi, atau tidak didukung.');
          if (name !== 'manifest.json' && !name.startsWith('upload/') && !/^chunks\/\d+-\d+$/.test(name)) throw invalid('Arsip bukan File Backup NIST Basis.');
          if (name.startsWith('upload/')) normalizePath(name.slice(7));
          // Each new part has bounded extraction; legacy ZIPs remain compatible.
          const limit = name === 'manifest.json' ? partLimit : Number.MAX_SAFE_INTEGER;
          total += entry.uncompressedSize;
          if (!Number.isSafeInteger(total) || entry.uncompressedSize > limit) throw invalid('Ukuran manifest tidak valid.');
          if (total > (detectedVersion === 2 ? partLimit : 2 * 1024 * 1024 * 1024)) throw invalid('Ukuran hasil ekstraksi bagian backup melebihi batas.');
          const target = path.join(staging, `${index}-${entries.size}`);
          const input = await new Promise((accept, fail) => zip.openReadStream(entry, (error, stream) => error ? fail(error) : accept(stream)));
          let bytes = 0, checksum = 0;
          const check = new Transform({ transform(chunk, encoding, callback) {
            bytes += chunk.length; checksum = crc32.buf(chunk, checksum);
            callback(bytes > entry.uncompressedSize ? invalid('Ukuran hasil ekstraksi tidak sesuai.') : null, chunk);
          } });
          await pipeline(input, check, fs.createWriteStream(target, { flags: 'wx' }));
          if (bytes !== entry.uncompressedSize || (checksum >>> 0) !== entry.crc32) throw invalid('File dalam arsip rusak (checksum tidak sesuai).');
          if (name === 'manifest.json') {
            try { detectedVersion = JSON.parse(await fs.promises.readFile(target, 'utf8')).version; }
            catch { throw invalid('Manifest backup tidak valid.'); }
            if (detectedVersion === 2 && total > partLimit) throw invalid('Bagian backup melebihi batas ukuran.');
          }
          entries.set(name, { target, size: bytes }); zip.readEntry();
        })().catch(error => { zip.close(); reject(error); });
      }); zip.readEntry();
    });
    const entry = entries.get('manifest.json');
    if (!entry) throw invalid('Manifest backup tidak ditemukan.');
    let manifest;
    try { manifest = JSON.parse(await fs.promises.readFile(entry.target, 'utf8')); } catch { throw invalid('Manifest backup tidak valid.'); }
    if (manifest?.format !== 'NIST Basis file backup' || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.files)) throw invalid('Format File Backup tidak didukung.');
    if (manifest.version === 2 && total > partLimit) throw invalid('Bagian backup melebihi batas ukuran.');
    return { manifest, entries };
  } finally { zip.close(); }
}
function createFileBackupService({ db = pool, store = storage, root = path.join(backupRoot, 'files'), partLimit = MAX_PART_BYTES } = {}) {
  if (!Number.isSafeInteger(partLimit) || partLimit < 8192 || partLimit > MAX_PART_BYTES) throw new Error('Invalid part limit');
  const pattern = /^nist-basis-files-\d{8}T\d{6}Z-[a-f0-9-]{36}(?:-part-\d+-of-\d+)?\.zip$/;
  async function resolve(fileName) {
    if (typeof fileName !== 'string' || !pattern.test(fileName)) throw invalid('Invalid file backup filename');
    return path.join(root, fileName);
  }
  function selection(folder) {
    if (folder == null || folder === '') return '';
    if (typeof folder !== 'string') throw invalid('Folder tidak valid.');
    return store.normalizePath(folder);
  }
  const matches = (filePath, folder) => !folder || filePath.startsWith(`${folder}/`);
  async function folders() {
    const { rows } = await db.query('SELECT path FROM evidence_files ORDER BY path');
    const result = new Set();
    for (const row of rows) { const parts = store.normalizePath(row.path).split('/'); for (let i = 1; i < parts.length; i++) result.add(parts.slice(0, i).join('/')); }
    return [...result].sort();
  }
  async function create({ folder: requestedFolder } = {}) {
    const folder = selection(requestedFolder);
    await fs.promises.mkdir(root, { recursive: true });
    const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nist-file-backup-'));
    const createdAt = new Date().toISOString(), batchId = randomUUID();
    const timestamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const base = `nist-basis-files-${timestamp}-${batchId}`;
    const published = [], temporary = [];
    try {
      const { rows } = await db.query('SELECT path, name, mime_type, open_page, updated_at, uploaded_by FROM evidence_files ORDER BY path');
      const files = [], chunks = [], missingFiles = []; let totalSize = 0;
      // Reserve ample ZIP headers/manifest space; pack by bytes including per-entry metadata.
      const payloadLimit = Math.floor(partLimit * 0.94);
      for (const row of rows) {
        const normalized = store.normalizePath(row.path); if (!matches(normalized, folder)) continue;
        let input;
        try { input = store.openRead ? await store.openRead(normalized) : Readable.from([await store.read(normalized)]); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const legacy = await db.query('SELECT content FROM evidence_files WHERE path = $1', [normalized]);
          if (!legacy.rows[0]?.content) {
            missingFiles.push({ path: normalized, name: row.name, reason: 'File tidak tersedia di storage maupun database.' });
            continue;
          }
          input = Readable.from([legacy.rows[0].content]);
        }
        const fileIndex = files.length; let size = 0, number = 0, handle, current;
        async function nextChunk() {
          current = { fileIndex, offset: size, size: 0, entry: `chunks/${fileIndex}-${number++}`, target: path.join(staging, `chunk-${chunks.length}`) };
          chunks.push(current); handle = await fs.promises.open(current.target, 'wx');
        }
        try {
          await nextChunk();
          for await (const buffer of input) {
            let offset = 0;
            while (offset < buffer.length) {
              if (current.size === payloadLimit) { await handle.close(); handle = null; await nextChunk(); }
              const length = Math.min(buffer.length - offset, payloadLimit - current.size);
              let written = 0;
              while (written < length) { const result = await handle.write(buffer, offset + written, length - written); if (!result.bytesWritten) throw new Error('Backup staging write failed'); written += result.bytesWritten; }
              current.size += length; size += length; offset += length;
            }
          }
        } finally { await handle?.close(); input.destroy(); }
        files.push({ ...row, path: normalized, size }); totalSize += size;
      }
      if (folder && !files.length && !missingFiles.length) throw invalid('Folder tidak berisi file untuk dibackup.');
      const groups = []; let group = [], used = 2048;
      for (const chunk of chunks) {
        const cost = chunk.size + Buffer.byteLength(JSON.stringify(files[chunk.fileIndex])) + 1024;
        if (cost + 2048 > partLimit) throw invalid('Metadata file terlalu besar untuk satu bagian backup.');
        if (used + cost > partLimit) { groups.push(group); group = []; used = 2048; }
        group.push(chunk); used += cost;
      }
      groups.push(group);
      const legacy = groups.length === 1 && chunks.length === files.length;
      const parts = [];
      for (let index = 0; index < groups.length; index++) {
        const fileName = `${base}${legacy ? '' : `-part-${String(index + 1).padStart(4, '0')}-of-${String(groups.length).padStart(4, '0')}`}.zip`;
        const target = await resolve(fileName), temp = `${target}.partial`; temporary.push(temp);
        const entries = groups[index];
        const manifest = legacy ? { format: 'NIST Basis file backup', version: 1, createdAt, folder, files, complete: !missingFiles.length, missingFiles } : {
          format: 'NIST Basis file backup', version: 2, createdAt, folder, batchId, part: index + 1, partCount: groups.length, fileCount: files.length, totalSize,
          files: [...new Set(entries.map(chunk => chunk.fileIndex))].map(fileIndex => ({ ...files[fileIndex], fileIndex })),
          chunks: entries.map(({ target: unused, ...chunk }) => chunk),
          complete: !missingFiles.length, missingFileCount: missingFiles.length, missingFiles: index === 0 ? missingFiles : [],
        };
        await writeZip(temp, manifest, entries.map(chunk => ({ ...chunk, entry: legacy ? `upload/${files[chunk.fileIndex].path}` : chunk.entry })));
        const size = (await fs.promises.stat(temp)).size;
        if (size > partLimit) throw new Error('Backup part exceeded its reserved size');
        parts.push({ fileName, createdAt, size, part: index + 1, partCount: groups.length, batchId });
      }
      // Publish only after every part has been successfully completed.
      for (const part of parts) { const target = await resolve(part.fileName); await fs.promises.rename(`${target}.partial`, target); published.push(target); }
      return { fileName: parts[0].fileName, createdAt, batchId, size: parts.reduce((sum, part) => sum + part.size, 0), totalSize, fileCount: files.length, parts, complete: !missingFiles.length, missingFiles };
    } catch (error) { for (const file of [...temporary, ...published]) await fs.promises.rm(file, { force: true }); throw error; }
    finally { await cleanup(staging); }
  }
  async function list() {
    await fs.promises.mkdir(root, { recursive: true });
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const rows = await Promise.all(entries.filter(entry => entry.isFile() && pattern.test(entry.name)).map(async entry => {
      const stats = await fs.promises.stat(await resolve(entry.name));
      const part = entry.name.match(/-part-(\d+)-of-(\d+)\.zip$/);
      return { fileName: entry.name, size: stats.size, createdAt: stats.mtime.toISOString(), ...(part ? { part: Number(part[1]), partCount: Number(part[2]), batchId: entry.name.replace(/-part-.*$/, '') } : {}) };
    }));
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.fileName.localeCompare(b.fileName));
  }
  async function remove(fileName) { await fs.promises.rm(await resolve(fileName), { force: true }); }
  async function restore(input, { folder: requestedFolder } = {}) {
    const uploads = Array.isArray(input) ? input : [input];
    if (!uploads.length || uploads.some(file => !file?.path)) throw invalid('Pilih file backup ZIP.');
    const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nist-file-recovery-'));
    let restoredCount = 0;
    try {
      const folder = selection(requestedFolder), archives = [];
      for (let index = 0; index < uploads.length; index++) archives.push(await extract(uploads[index], staging, index, store.normalizePath, partLimit));
      const records = new Map(), indexed = new Map();
      const batch = archives[0].manifest;
      function validate(item) {
        if (!item || typeof item.path !== 'string') throw invalid('Path file pada manifest tidak valid.');
        const normalized = store.normalizePath(item.path);
        if (item.uploaded_by != null && !/^[1-9]\d*$/.test(String(item.uploaded_by))) throw invalid('Pemilik file pada manifest tidak valid.');
        if (normalized !== item.path || !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.name !== 'string' || !item.name || typeof item.mime_type !== 'string' || !item.mime_type || (item.open_page != null && (!Number.isInteger(item.open_page) || item.open_page < 1))) throw invalid('Isi arsip tidak sesuai dengan manifest.');
      }
      if (batch.version === 1) {
        if (archives.length !== 1) throw invalid('ZIP lama dipulihkan satu per satu. Pilih satu arsip atau seluruh bagian dari satu batch.');
        for (const item of batch.files) {
          validate(item); const entry = archives[0].entries.get(`upload/${item.path}`);
          if (records.has(item.path) || !entry || entry.size !== item.size) throw invalid('Isi arsip tidak sesuai dengan manifest.');
          records.set(item.path, { item, chunks: [{ ...entry, offset: 0 }] });
        }
        if (archives[0].entries.size !== records.size + 1) throw invalid('Arsip berisi file yang tidak terdaftar pada manifest.');
      } else {
        if (!/^[a-f0-9-]{36}$/.test(batch.batchId) || !Number.isSafeInteger(batch.partCount) || batch.partCount < 1 || !Number.isSafeInteger(batch.fileCount) || batch.fileCount < 0 || !Number.isSafeInteger(batch.totalSize) || batch.totalSize < 0) throw invalid('Identitas batch tidak valid.');
        if (archives.length !== batch.partCount) throw invalid(`Batch belum lengkap: pilih seluruh ${batch.partCount} bagian backup.`);
        const parts = new Set();
        for (const { manifest, entries } of archives) {
          if (manifest.version !== 2 || manifest.batchId !== batch.batchId || manifest.partCount !== batch.partCount || manifest.fileCount !== batch.fileCount || manifest.totalSize !== batch.totalSize || manifest.folder !== batch.folder || manifest.createdAt !== batch.createdAt || !Number.isInteger(manifest.part) || manifest.part < 1 || manifest.part > batch.partCount || parts.has(manifest.part) || !Array.isArray(manifest.chunks)) throw invalid('Bagian batch duplikat atau berasal dari backup berbeda.');
          parts.add(manifest.part); const local = new Set();
          for (const item of manifest.files) {
            validate(item);
            if (!Number.isInteger(item.fileIndex) || item.fileIndex < 0 || item.fileIndex >= batch.fileCount || local.has(item.fileIndex)) throw invalid('Indeks file batch tidak valid.');
            local.add(item.fileIndex);
            const prior = indexed.get(item.fileIndex);
            if (prior && JSON.stringify(prior.item) !== JSON.stringify(item)) throw invalid('Metadata antarbagian tidak sesuai.');
            if (!prior) {
              if (records.has(item.path)) throw invalid('Path file batch duplikat.');
              const record = { item, chunks: [] }; records.set(item.path, record); indexed.set(item.fileIndex, record);
            }
          }
          const registered = new Set(['manifest.json']), used = new Set();
          for (const chunk of manifest.chunks) {
            const record = indexed.get(chunk.fileIndex), entry = entries.get(chunk.entry);
            if (!local.has(chunk.fileIndex) || !record || !/^chunks\/\d+-\d+$/.test(chunk.entry) || !entry || registered.has(chunk.entry) || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || !Number.isSafeInteger(chunk.size) || chunk.size < 0 || chunk.size !== entry.size) throw invalid('Potongan file batch tidak sesuai manifest.');
            registered.add(chunk.entry); used.add(chunk.fileIndex); record.chunks.push({ ...entry, offset: chunk.offset });
          }
          if (registered.size !== entries.size || used.size !== local.size) throw invalid('Arsip berisi file yang tidak terdaftar pada manifest.');
        }
        if (records.size !== batch.fileCount) throw invalid('File batch tidak lengkap.');
        let total = 0;
        for (const { item, chunks } of records.values()) {
          chunks.sort((a, b) => a.offset - b.offset); let size = 0;
          for (const chunk of chunks) { if (chunk.offset !== size || (chunk.size === 0 && (item.size !== 0 || chunks.length !== 1))) throw invalid('Potongan file hilang atau tumpang tindih.'); size += chunk.size; }
          if (size !== item.size || !chunks.length) throw invalid('Potongan file tidak lengkap.'); total += size;
        }
        if (total !== batch.totalSize) throw invalid('Total ukuran batch tidak sesuai.');
      }
      const selected = [...records.values()].filter(record => matches(record.item.path, folder));
      if (folder && !selected.length) throw invalid('Folder tidak ditemukan dalam arsip backup.');
      // All parts, manifests and checksums have been checked before touching live storage.
      for (const { item, chunks } of selected) {
        let sourcePath = chunks[0].target;
        if (chunks.length > 1) {
          sourcePath = path.join(staging, `assembled-${restoredCount}`);
          async function* content() { for (const chunk of chunks) yield* fs.createReadStream(chunk.target); }
          await pipeline(Readable.from(content()), fs.createWriteStream(sourcePath, { flags: 'wx' }));
        }
        const owner = item.uploaded_by == null ? null : (await db.query('SELECT id FROM app_users WHERE id = $1', [item.uploaded_by])).rows[0]?.id || null;
        await store.put(item.path, { sourcePath, name: item.name, mimeType: item.mime_type, uploadedBy: owner }); restoredCount++;
        await db.query('UPDATE evidence_files SET open_page=$1, uploaded_by=$2 WHERE path=$3', [item.open_page || 1, owner, item.path]);
        if (chunks.length > 1) await fs.promises.rm(sourcePath, { force: true });
      }
      return { restored: true, fileName: uploads[0].originalname, fileCount: restoredCount, partCount: uploads.length, missingFiles: archives.flatMap(archive => Array.isArray(archive.manifest.missingFiles) ? archive.manifest.missingFiles : []) };
    } catch (error) { if (restoredCount) throw Object.assign(new Error(`Restore berhenti setelah ${restoredCount} file dipulihkan. ${error.message}`), { status: error.status || 500 }); throw error; }
    finally { await cleanup(staging); for (const file of uploads) await fs.promises.rm(file.path, { force: true }); }
  }
  return { create, folders, list, resolve, remove, restore };
}
module.exports = { ...createFileBackupService(), createFileBackupService, MAX_PART_BYTES };
