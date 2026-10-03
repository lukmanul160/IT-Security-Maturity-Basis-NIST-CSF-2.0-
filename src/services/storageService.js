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

function createStorageService({ db = pool, localRoot = uploadRoot, applicationRoot = projectRoot, cloud = require('./cloudStorageService').createCloudStorageService() } = {}) {
  const cloudConfig = loc => loc.root.startsWith('cloud:') ? JSON.parse(loc.root.slice(6)) : null;
  let ready;
  async function ensureStore() {
    if (!ready) ready = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS file_storage_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL CHECK (mode IN ('local', 'shared')),
        directory TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.query(`CREATE TABLE IF NOT EXISTS file_storage_locations (
        path TEXT PRIMARY KEY, root TEXT NOT NULL, object_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.query(`DO $$ BEGIN
        LOCK TABLE file_storage_settings IN ACCESS EXCLUSIVE MODE;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'file_storage_settings'::regclass
          AND conname = 'file_storage_settings_mode_check' AND pg_get_constraintdef(oid) LIKE '%s3%') THEN
          ALTER TABLE file_storage_settings DROP CONSTRAINT IF EXISTS file_storage_settings_mode_check;
          ALTER TABLE file_storage_settings ADD CONSTRAINT file_storage_settings_mode_check CHECK (mode IN ('local', 'shared', 's3', 'gcs'));
        END IF;
      END $$`);
      await db.query(`ALTER TABLE file_storage_settings ADD COLUMN IF NOT EXISTS cloud_config JSONB NOT NULL DEFAULT '{}'::jsonb`);
    })().catch(error => { ready = undefined; throw error; });
    return ready;
  }
  async function getSettings() {
    await ensureStore();
    const result = await db.query('SELECT mode, directory, cloud_config FROM file_storage_settings WHERE id = 1');
    return { ...result.rows[0]?.cloud_config, mode: result.rows[0]?.mode || 'local', directory: result.rows[0]?.directory || '', localDirectory: localRoot };
  }
  function validateSettings(data) {
    if (!data || !['local', 'shared', 's3', 'gcs'].includes(data.mode)) throw invalid('Pilih penyimpanan lokal, folder storage, AWS S3, atau Google Cloud.');
    if (['s3', 'gcs'].includes(data.mode)) {
      const bucket = String(data.bucket || '').trim();
      const region = String(data.region || '').trim();
      const projectId = String(data.projectId || '').trim();
      const prefix = String(data.prefix || '').trim().replace(/^\/+|\/+$/g, '');
      if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw invalid('Isi nama bucket yang valid, tanpa URL.');
      if (data.mode === 's3' && !/^[a-z0-9-]{3,64}$/.test(region)) throw invalid('Isi AWS region, contoh ap-southeast-1.');
      if (projectId && !/^[a-z0-9-]{3,100}$/.test(projectId)) throw invalid('Google Cloud project ID tidak valid.');
      if (prefix.length > 500) throw invalid('Prefix maksimal 500 karakter.');
      if (prefix) normalizePath(prefix);
      return { mode: data.mode, directory: '', bucket, region: data.mode === 's3' ? region : '', projectId: data.mode === 'gcs' ? projectId : '', prefix };
    }
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
    if (['s3', 'gcs'].includes(settings.mode)) {
      const adapter = cloud.adapter(settings);
      const key = `${settings.prefix ? `${settings.prefix}/` : ''}.nist-storage-test-${crypto.randomUUID()}`;
      const content = crypto.randomBytes(32);
      try {
        await adapter.put(key, content, 'application/octet-stream');
        if (!(await adapter.read(key)).equals(content)) throw new Error('Read verification failed');
        await adapter.remove(key);
        return { ...settings, message: 'Tes baca, tulis, dan hapus bucket berhasil.' };
      } catch (error) {
        await adapter.remove(key).catch(() => {});
        throw invalid('Bucket tidak dapat dibaca/ditulis/dihapus. Periksa nama bucket, region, kredensial server, dan izin akses.');
      }
    }
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
    const config = ['s3', 'gcs'].includes(checked.mode) ? validateSettings(checked) : {};
    await db.query(`INSERT INTO file_storage_settings (id, mode, directory, cloud_config) VALUES (1,$1,$2,$3)
      ON CONFLICT (id) DO UPDATE SET mode=EXCLUDED.mode, directory=EXCLUDED.directory, cloud_config=EXCLUDED.cloud_config, updated_at=NOW()`, [checked.mode, checked.directory, JSON.stringify(config)]);
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
    try { return cloudConfig(loc) ? await cloud.adapter(cloudConfig(loc)).read(loc.key) : await fs.readFile(await physicalPath(loc)); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 404 || error.$metadata?.httpStatusCode === 404) throw Object.assign(new Error('File tidak ditemukan pada lokasi penyimpanannya.'), { status: 404, code: 'ENOENT' });
      if (error.status) throw error;
      throw Object.assign(new Error('Storage file tidak dapat diakses. Periksa koneksi, kredensial, dan izin storage.'), { status: 503 });
    }
  }
  async function exists(relativePath) {
    const loc = await location(relativePath);
    if (cloudConfig(loc)) return cloud.adapter(cloudConfig(loc)).exists(loc.key);
    try { await fs.access(await physicalPath(loc)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async function removePhysical(loc) {
    if (cloudConfig(loc)) return cloud.adapter(cloudConfig(loc)).remove(loc.key);
    try { await fs.unlink(await physicalPath(loc)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function put(relativePath, { sourcePath, buffer, name, mimeType, uploadedBy = null }, { replace = false } = {}) {
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
      const root = replace ? old.root : ['s3', 'gcs'].includes(settings.mode) ? `cloud:${JSON.stringify(validateSettings(settings))}` : settings.mode === 'shared' ? settings.directory : localRoot;
      // Shared storage must already exist; never silently fall back to local.
      if (root === localRoot) await fs.mkdir(root, { recursive: true });
      nextLocation = { root, key: `.objects/${crypto.randomUUID()}/${path.posix.basename(normalized)}` };
      const config = cloudConfig(nextLocation);
      if (config) {
        nextLocation.key = `${config.prefix ? `${config.prefix}/` : ''}${nextLocation.key}`;
        await cloud.adapter(config).put(nextLocation.key, sourcePath ? await fs.readFile(sourcePath) : buffer, mimeType);
      } else {
        await fs.access(root);
        const target = await physicalPath(nextLocation, { create: true });
        if (sourcePath) await fs.copyFile(sourcePath, target, require('node:fs').constants.COPYFILE_EXCL);
        else await fs.writeFile(target, buffer, { flag: 'wx' });
      }
      await client.query(`INSERT INTO file_storage_locations (path, root, object_key) VALUES ($1,$2,$3)
        ON CONFLICT (path) DO UPDATE SET root=EXCLUDED.root, object_key=EXCLUDED.object_key, updated_at=NOW()`, [normalized, root === localRoot ? '' : root, nextLocation.key]);
      await client.query(`INSERT INTO evidence_files (path, name, content, mime_type, updated_at, uploaded_by) VALUES ($1,$2,NULL,$3,NOW(),$4)
        ON CONFLICT (path) DO UPDATE SET name=EXCLUDED.name, content=NULL, mime_type=EXCLUDED.mime_type, updated_at=NOW()`, [normalized, name, mimeType, uploadedBy]);
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
