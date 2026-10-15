const { randomUUID } = require('node:crypto');
const { pool } = require('../config/database');
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const types = ['room', 'wall', 'door', 'window', 'desk', 'meeting', 'chair', 'sofa', 'toilet', 'sink', 'plant', 'label'];
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS office_designs (
    id UUID PRIMARY KEY, name TEXT NOT NULL, layout JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
function validate(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 150) throw invalid('Nama denah wajib diisi, maksimum 150 karakter.');
  if (!Number.isInteger(input.version) || input.version < 0) throw invalid('Versi denah tidak valid.');
  const layout = input.layout;
  if (!layout || ![layout.width, layout.height].every(value => Number.isInteger(value) && value >= 200 && value <= 4000) || !Array.isArray(layout.nodes) || layout.nodes.length > 500) throw invalid('Ukuran kanvas harus 200–4000, maksimum 500 objek.');
  const ids = new Set();
  const nodes = layout.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(node.id) || ids.has(node.id) || !types.includes(node.type)) throw invalid('Objek denah tidak valid.');
    ids.add(node.id);
    if (![node.x, node.y, node.width, node.height, node.rotation].every(Number.isFinite) || node.x < 0 || node.y < 0 || node.width < 5 || node.height < 5 || node.x + node.width > layout.width || node.y + node.height > layout.height || node.rotation < 0 || node.rotation >= 360) throw invalid('Posisi atau ukuran objek di luar kanvas.');
    if (typeof node.label !== 'string' || node.label.length > 120) throw invalid('Label objek maksimum 120 karakter.');
    return Object.fromEntries(['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'label'].map(key => [key, node[key]]));
  });
  return { name: input.name.trim(), version: input.version, layout: { width: layout.width, height: layout.height, nodes } };
}
async function list() {
  return (await pool.query('SELECT id,name,version,updated_at AS "updatedAt" FROM office_designs ORDER BY updated_at DESC,id')).rows;
}
async function read(id) {
  const row = (await pool.query('SELECT id,name,layout,version FROM office_designs WHERE id=$1', [id])).rows[0];
  if (!row) throw invalid('Denah tidak ditemukan.', 404);
  return row;
}
async function save(id, input) {
  const data = validate(input);
  if (!id) return (await pool.query('INSERT INTO office_designs(id,name,layout) VALUES($1,$2,$3) RETURNING id,name,layout,version', [randomUUID(), data.name, data.layout])).rows[0];
  const result = await pool.query('UPDATE office_designs SET name=$2,layout=$3,version=version+1,updated_at=NOW() WHERE id=$1 AND version=$4 RETURNING id,name,layout,version', [id, data.name, data.layout, data.version]);
  if (!result.rows.length) throw invalid('Denah berubah atau telah dihapus. Muat ulang sebelum menyimpan.', 409);
  return result.rows[0];
}
async function remove(id, version) {
  if (!Number.isInteger(version) || version < 1) throw invalid('Versi denah tidak valid.');
  const result = await pool.query('DELETE FROM office_designs WHERE id=$1 AND version=$2', [id, version]);
  if (!result.rowCount) throw invalid('Denah berubah atau telah dihapus. Muat ulang terlebih dahulu.', 409);
}
module.exports = { ensureStore, validate, types, list, read, save, remove };
