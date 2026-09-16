const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pool } = require('../config/database');
const { uploadRoot, projectRoot } = require('../config/paths');

const invalid = message => Object.assign(new Error(message), { status: 400 });
function normalizePath(value) {
  const text = String(value || '').replaceAll('\\', '/');
  if (!text || text.startsWith('/') || /[:\x00-\x1f]/.test(text) || text.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw invalid('Invalid file path');
  }
  return text;
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function createStorageService({ db = pool, localRoot = uploadRoot, applicationRoot = projectRoot } = {}) {
  let ready;
  async function ensureStore() {
    if (!ready) ready = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS file_storage_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL CHECK (mode IN ('local', 'shared')),
        directory TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.query(`CREATE TABLE IF NOT EXISTS file_storage_locations (
        path TEXT PRIMARY KEY, root TEXT NOT NULL, object_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  }
  async function getSettings() {
    await ensureStore();
    const result = await db.query('SELECT mode, directory FROM file_storage_settings WHERE id = 1');
    return { mode: result.rows[0]?.mode || 'local', directory: result.rows[0]?.directory || '', localDirectory: localRoot };
  }
  function validateSettings(data) {
    if (!data || !['local', 'shared'].includes(data.mode)) throw invalid('Pilih penyimpanan lokal atau folder storage.');
    if (data.mode === 'local') return { mode: 'local', directory: '' };
    if (typeof data.directory !== 'string') throw invalid('Isi path folder storage.');
    const directory = data.directory.trim();
    if (!path.isAbsolute(directory) || directory.includes('\0') || (process.platform === 'win32' && (!/^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(directory) || /^\\\\[?.]\\/.test(directory)))) {
      throw invalid('Gunakan path absolut atau UNC yang dapat diakses server.');
    }
    const resolved = path.resolve(directory);
    if (resolved === path.parse(resolved).root || inside(applicationRoot, resolved) || inside(resolved, applicationRoot)) {
      throw invalid('Gunakan folder storage khusus di luar folder aplikasi, bukan root drive.');
    }
    return { mode: 'shared', directory: resolved };
  }
  async function testSettings(data) {
    const settings = validateSettings(data);
    const directory = settings.mode === 'local' ? localRoot : settings.directory;
    if (settings.mode === 'local') await fs.mkdir(directory, { recursive: true });
    let probe;
    try {
      const real = await fs.realpath(directory);
      if (!(await fs.stat(real)).isDirectory()) throw new Error('Not a directory');
      if (settings.mode === 'shared') {
        const realApp = await fs.realpath(applicationRoot);
        if (inside(realApp, real) || inside(real, realApp) || real === path.parse(real).root) throw invalid('Folder storage harus terpisah dari aplikasi.');
        settings.directory = real;
      }
      probe = path.join(real, `.nist-storage-test-${crypto.randomUUID()}`);
      const content = crypto.randomBytes(32);
      await fs.writeFile(probe, content, { flag: 'wx' });
      if (!(await fs.readFile(probe)).equals(content)) throw new Error('Read verification failed');
      await fs.unlink(probe);
      probe = undefined;
      return { ...settings, message: 'Tes baca, tulis, dan hapus berhasil.' };
    } catch (error) {
      if (error.status) throw error;
      throw Object.assign(new Error('Folder storage tidak dapat dibaca/ditulis/dihapus oleh akun server. Pastikan folder tersedia dan izin akses sesuai.'), { status: 400 });
    } finally {
      if (probe) await fs.unlink(probe).catch(() => {});
    }
  }
  async function saveSettings(data) {
    const checked = await testSettings(data);
    await ensureStore();
    await db.query(`INSERT INTO file_storage_settings (id, mode, directory) VALUES (1,$1,$2)
      ON CONFLICT (id) DO UPDATE SET mode=EXCLUDED.mode, directory=EXCLUDED.directory, updated_at=NOW()`, [checked.mode, checked.directory]);
    return getSettings();
  }
  async function location(relativePath, client = db) {
    const normalized = normalizePath(relativePath);
    await ensureStore();
    const result = await client.query('SELECT root, object_key FROM file_storage_locations WHERE path = $1', [normalized]);
    const row = result.rows[0];
    return { root: row?.root || localRoot, key: row?.object_key || normalized, managed: Boolean(row) };
  }
  async function physicalPath(loc, { create = false } = {}) {
    const key = normalizePath(loc.key);
    const root = await fs.realpath(loc.root);
    const target = path.resolve(root, key);
    if (!inside(root, target) || target === root) throw invalid('Invalid storage path');
    // Walk each parent; do not follow symlinks/junctions out of the storage root.
    let parent = root;
    for (const segment of key.split('/').slice(0, -1)) {
      parent = path.join(parent, segment);
      if (create) await fs.mkdir(parent).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if (!inside(root, await fs.realpath(parent))) throw invalid('Invalid storage directory');
    }
    try {
      if ((await fs.lstat(target)).isSymbolicLink()) throw invalid('Symbolic link files are not supported');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return target;
  }
  async function read(relativePath) {
    const loc = await location(relativePath);
    try { return await fs.readFile(await physicalPath(loc)); }
    catch (error) {
      if (error.code === 'ENOENT') throw Object.assign(new Error('File tidak ditemukan pada lokasi penyimpanannya.'), { status: 404, code: 'ENOENT' });
      if (error.status) throw error;
      throw Object.assign(new Error('Storage file tidak dapat diakses. Periksa koneksi dan izin folder.'), { status: 503 });
    }
  }
  async function exists(relativePath) {
    const loc = await location(relativePath);
    try { await fs.access(await physicalPath(loc)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async function removePhysical(loc) {
    try { await fs.unlink(await physicalPath(loc)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function put(relativePath, { sourcePath, buffer, name, mimeType }, { replace = false } = {}) {
    const normalized = normalizePath(relativePath);
    await ensureStore();
    const client = await db.connect();
    let nextLocation;
    let committed = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`file-storage:${normalized}`]);
      const old = await location(normalized, client);
      const settings = await getSettings();
      const root = replace ? old.root : settings.mode === 'shared' ? settings.directory : localRoot;
      // Shared storage must already exist; never silently fall back to local.
      if (root === localRoot) await fs.mkdir(root, { recursive: true });
      await fs.access(root);
      nextLocation = { root, key: `.objects/${crypto.randomUUID()}/${path.posix.basename(normalized)}` };
      const target = await physicalPath(nextLocation, { create: true });
      if (sourcePath) await fs.copyFile(sourcePath, target, require('node:fs').constants.COPYFILE_EXCL);
      else await fs.writeFile(target, buffer, { flag: 'wx' });
      await client.query(`INSERT INTO file_storage_locations (path, root, object_key) VALUES ($1,$2,$3)
        ON CONFLICT (path) DO UPDATE SET root=EXCLUDED.root, object_key=EXCLUDED.object_key, updated_at=NOW()`, [normalized, root === localRoot ? '' : root, nextLocation.key]);
      await client.query(`INSERT INTO evidence_files (path, name, content, mime_type, updated_at) VALUES ($1,$2,NULL,$3,NOW())
        ON CONFLICT (path) DO UPDATE SET name=EXCLUDED.name, content=NULL, mime_type=EXCLUDED.mime_type, updated_at=NOW()`, [normalized, name, mimeType]);
      await client.query('COMMIT');
      committed = true;
      // Legacy copies remain untouched until explicitly deleted. Managed old versions are safe to retire.
      if (old.managed) await removePhysical(old).catch(error => console.error('[storage] Old version cleanup failed:', error.code));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (nextLocation && !committed) await removePhysical(nextLocation).catch(() => {});
      if (error.status) throw error;
      throw Object.assign(new Error('File gagal disimpan. Periksa koneksi storage dan database; lokasi tidak dialihkan otomatis.'), { status: 503 });
    } finally { client.release(); }
  }
  async function remove(relativePath) {
    const normalized = normalizePath(relativePath);
    const loc = await location(normalized);
    await removePhysical(loc);
    await db.query('DELETE FROM file_storage_locations WHERE path = $1', [normalized]);
  }
  return { ensureStore, getSettings, validateSettings, testSettings, saveSettings, read, exists, put, remove };
}

module.exports = { ...createStorageService(), createStorageService, normalizePath };
