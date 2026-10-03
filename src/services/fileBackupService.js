const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { finished } = require('node:stream/promises');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const os = require('node:os');
const yauzl = require('yauzl');
const crc32 = require('crc-32');
const archiver = require('archiver');
const { pool } = require('../config/database');
const storage = require('./storageService');
const { backupRoot } = require('../config/paths');

function createFileBackupService({ db = pool, store = storage, root = path.join(backupRoot, 'files') } = {}) {
  const pattern = /^nist-basis-files-\d{8}T\d{6}Z-[a-f0-9-]{36}\.zip$/;
  async function resolve(fileName) {
    if (typeof fileName !== 'string' || !pattern.test(fileName)) throw Object.assign(new Error('Invalid file backup filename'), { status: 400 });
    return path.join(root, fileName);
  }
  async function create() {
    await fs.promises.mkdir(root, { recursive: true });
    const createdAt = new Date().toISOString();
    const timestamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const fileName = `nist-basis-files-${timestamp}-${randomUUID()}.zip`;
    const target = await resolve(fileName);
    const temporary = `${target}.partial`;
    const output = fs.createWriteStream(temporary, { flags: 'wx' });
    const archive = archiver('zip', { zlib: { level: 6 } });
    const completion = finished(output);
    completion.catch(() => {});
    archive.on('error', error => output.destroy(error));
    archive.on('warning', error => output.destroy(error));
    archive.pipe(output);
    try {
      const { rows } = await db.query('SELECT path, name, mime_type, open_page, updated_at, uploaded_by FROM evidence_files ORDER BY path');
      const files = [];
      for (const row of rows) {
        const normalized = store.normalizePath(row.path);
        let content;
        try { content = await store.read(normalized); }
        catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const legacy = await db.query('SELECT content FROM evidence_files WHERE path = $1', [normalized]);
          if (!legacy.rows[0]?.content) throw error;
          content = legacy.rows[0].content;
        }
        // Wait until each entry is consumed to avoid retaining every file in memory.
        await new Promise((accept, reject) => {
          const done = () => { archive.off('error', failed); output.off('error', failed); accept(); };
          const failed = error => { archive.off('entry', done); archive.off('error', failed); output.off('error', failed); reject(error); };
          archive.once('entry', done);
          archive.once('error', failed);
          output.once('error', failed);
          archive.append(content, { name: `upload/${normalized}` });
        });
        files.push({ ...row, path: normalized, size: content.length });
      }
      archive.append(JSON.stringify({ format: 'NIST Basis file backup', version: 1, createdAt, files }, null, 2), { name: 'manifest.json' });
      await archive.finalize();
      await completion;
      await fs.promises.rename(temporary, target);
      return { fileName, createdAt, size: (await fs.promises.stat(target)).size, fileCount: files.length };
    } catch (error) {
      archive.abort();
      output.destroy();
      await completion.catch(() => {});
      await fs.promises.rm(temporary, { force: true });
      throw error;
    }
  }
  async function list() {
    await fs.promises.mkdir(root, { recursive: true });
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const rows = await Promise.all(entries.filter(entry => entry.isFile() && pattern.test(entry.name)).map(async entry => {
      const stats = await fs.promises.stat(await resolve(entry.name));
      return { fileName: entry.name, size: stats.size, createdAt: stats.mtime.toISOString() };
    }));
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function remove(fileName) { await fs.promises.rm(await resolve(fileName), { force: true }); }
  async function restore(file) {
    if (!file?.path) throw Object.assign(new Error('Pilih file backup ZIP.'), { status: 400 });
    const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nist-file-recovery-'));
    const invalid = message => Object.assign(new Error(message), { status: 400 });
    let zip;
    let restoredCount = 0;
    try {
      zip = await new Promise((accept, reject) => yauzl.open(file.path, { lazyEntries: true, strictFileNames: true }, (error, value) => error ? reject(invalid('Arsip ZIP tidak valid.')) : accept(value)));
      const entries = new Map();
      let total = 0;
      await new Promise((accept, reject) => {
        zip.on('error', reject);
        zip.on('end', accept);
        zip.on('entry', entry => {
          (async () => {
            const name = entry.fileName;
            if (entries.size >= 50000 || entries.has(name) || (entry.generalPurposeBitFlag & 1) || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw invalid('Arsip berisi entri duplikat, terenkripsi, atau tidak didukung.');
            if (name !== 'manifest.json' && !name.startsWith('upload/')) throw invalid('Arsip bukan File Backup NIST Basis.');
            if (name !== 'manifest.json') store.normalizePath(name.slice(7));
            const limit = name === 'manifest.json' ? 10 * 1024 * 1024 : 500 * 1024 * 1024;
            total += entry.uncompressedSize;
            if (entry.uncompressedSize > limit || total > 2 * 1024 * 1024 * 1024) throw invalid('Ukuran hasil restore melebihi batas 2 GB atau 500 MB per file.');
            const target = path.join(staging, String(entries.size));
            const input = await new Promise((done, fail) => zip.openReadStream(entry, (error, stream) => error ? fail(error) : done(stream)));
            let bytes = 0;
            let checksum = 0;
            const limiter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; checksum = crc32.buf(chunk, checksum); callback(bytes > limit ? invalid('Ukuran file hasil ekstraksi melebihi batas.') : null, chunk); } });
            await pipeline(input, limiter, fs.createWriteStream(target, { flags: 'wx' }));
            if ((checksum >>> 0) !== entry.crc32) throw invalid('File dalam arsip rusak (checksum tidak sesuai).');
            entries.set(name, { target, size: bytes });
            zip.readEntry();
          })().catch(error => { zip.close(); reject(error); });
        });
        zip.readEntry();
      });
      const manifestEntry = entries.get('manifest.json');
      if (!manifestEntry) throw invalid('Manifest backup tidak ditemukan.');
      let manifest;
      try { manifest = JSON.parse(await fs.promises.readFile(manifestEntry.target, 'utf8')); }
      catch { throw invalid('Manifest backup tidak valid.'); }
      if (manifest?.format !== 'NIST Basis file backup' || manifest.version !== 1 || !Array.isArray(manifest.files)) throw invalid('Format File Backup tidak didukung.');
      const paths = new Set();
      for (const item of manifest.files) {
        if (!item || typeof item.path !== 'string') throw invalid('Path file pada manifest tidak valid.');
        const normalized = store.normalizePath(item.path);
        if (item.uploaded_by != null && !/^[1-9]\d*$/.test(String(item.uploaded_by))) throw invalid('Pemilik file pada manifest tidak valid.');
        const entry = entries.get(`upload/${normalized}`);
        if (normalized !== item.path || paths.has(normalized) || !entry || !Number.isSafeInteger(item.size) || item.size !== entry.size || typeof item.name !== 'string' || !item.name || typeof item.mime_type !== 'string' || !item.mime_type || (item.open_page != null && (!Number.isInteger(item.open_page) || item.open_page < 1))) throw invalid('Isi arsip tidak sesuai dengan manifest.');
        paths.add(normalized);
      }
      if (entries.size !== paths.size + 1) throw invalid('Arsip berisi file yang tidak terdaftar pada manifest.');
      // Entire archive is checked before any live file is written.
      for (const item of manifest.files) {
        const owner = item.uploaded_by == null ? null : (await db.query('SELECT id FROM app_users WHERE id = $1', [item.uploaded_by])).rows[0]?.id || null;
        await store.put(item.path, { sourcePath: entries.get(`upload/${item.path}`).target, name: item.name, mimeType: item.mime_type, uploadedBy: owner });
        restoredCount++;
        await db.query('UPDATE evidence_files SET open_page=$1, uploaded_by=$2 WHERE path=$3', [item.open_page || 1, owner, item.path]);
      }
      return { restored: true, fileName: file.originalname, fileCount: restoredCount };
    } catch (error) {
      if (restoredCount) throw Object.assign(new Error(`Restore berhenti setelah ${restoredCount} file dipulihkan. ${error.message}`), { status: error.status || 500 });
      throw error;
    } finally {
      zip?.close();
      await fs.promises.rm(staging, { recursive: true, force: true });
      await fs.promises.rm(file.path, { force: true });
    }
  }
  return { create, list, resolve, remove, restore };
}
module.exports = { ...createFileBackupService(), createFileBackupService };
