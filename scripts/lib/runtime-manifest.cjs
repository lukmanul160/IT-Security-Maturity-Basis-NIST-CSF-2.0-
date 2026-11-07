/**
 * Daftar sumber classic-script bersama aplikasi dan fixture. Validasi dilakukan
 * sebelum membaca file; modul aplikasi dan konfigurasi environment tidak dijalankan.
 */
const fs = require('node:fs');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '../..');
const workspacePrefix = 'frontend/client/src/workspace/';

/** Urutan input dipertahankan karena urutan listener dan deklarasi duplikat bermakna. */
function validateRuntimeManifest(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Runtime manifest must contain source entries.');
  const names = new Set(), paths = new Set();
  return rows.map(row => {
    if (!row || typeof row.name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(row.name)) throw new Error('Runtime source needs a valid name.');
    const file = row.path;
    if (typeof file !== 'string' || file.includes('\0') || path.posix.normalize(file) !== file || !(file.startsWith(workspacePrefix + 'features/') && file.endsWith('.js') || file === 'src/shared/ikasScoring.js')) throw new Error('Runtime source path is outside the allowed source roots.');
    if (names.has(row.name) || paths.has(file)) throw new Error(`Duplicate runtime source: ${row.name} / ${file}`);
    if (row.group !== undefined && (typeof row.group !== 'string' || !/^[a-z][a-z0-9-]*$/.test(row.group))) throw new Error('Invalid runtime source group.');
    names.add(row.name); paths.add(file);
    return { name: row.name, path: file, ...(row.group ? { group: row.group } : {}) };
  });
}

function readRuntimeManifest(root = projectRoot) {
  return validateRuntimeManifest(JSON.parse(fs.readFileSync(path.join(root, workspacePrefix, 'runtime-parts.json'), 'utf8')));
}

/** Fixture memakai kelompok yang sama dengan produksi, tanpa menduplikasi urutan file. */
function readSourceGroup(group, root = projectRoot) {
  const rows = readRuntimeManifest(root).filter(row => (row.group || row.name) === group);
  if (!rows.length) throw new Error(`Unknown runtime source group: ${group}`);
  return rows.map(row => fs.readFileSync(path.join(root, row.path), 'utf8')).join('');
}

module.exports = { validateRuntimeManifest, readRuntimeManifest, readSourceGroup };
