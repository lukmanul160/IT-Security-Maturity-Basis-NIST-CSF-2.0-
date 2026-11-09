/** Application technology inventory, versioned PostgreSQL records; scans remain reviewable drafts. */
const { randomUUID } = require('node:crypto');
const { pool } = require('../config/database');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const rings = ['adopt', 'trial', 'assess', 'hold'],
  quadrants = ['framework', 'platform', 'data', 'tool'];
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS technology_assets (
    id UUID PRIMARY KEY, name TEXT NOT NULL, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw fail('Isian Technology Asset tidak valid atau terlalu panjang.');
  return value.trim();
}
function validate(input) {
  if (!input || !Number.isInteger(input.version) || input.version < 0)
    throw fail('Versi Technology Asset tidak valid.');
  const name = text(input.name, 200, true),
    owner = text(input.owner || '', 200),
    url = text(input.url || '', 2048),
    description = text(input.description || '', 4000);
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw fail('Gunakan URL http/https yang valid.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw fail('Gunakan URL http/https tanpa kredensial.');
  }
  if (!Array.isArray(input.technologies) || input.technologies.length > 100)
    throw fail('Maksimum 100 teknologi per aplikasi.');
  const seen = new Set();
  const technologies = input.technologies.map((row) => {
    if (
      !row ||
      !rings.includes(row.ring) ||
      !quadrants.includes(row.quadrant) ||
      !['manual', 'header', 'scan'].includes(row.source)
    )
      throw fail('Kategori, ring, atau sumber teknologi tidak valid.');
    const name = text(row.name, 100, true),
      version = text(row.version || '', 100),
      evidence = text(row.evidence || '', 1000),
      notes = text(row.notes || '', 2000);
    const key = [name.toLowerCase(), version.toLowerCase(), row.quadrant].join('|');
    if (seen.has(key)) throw fail('Teknologi dan versi duplikat pada aplikasi yang sama.');
    seen.add(key);
    let detection;
    if (row.detection !== undefined) {
      const value = row.detection;
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !Number.isFinite(value.confidence) ||
        value.confidence < 0 ||
        value.confidence > 100 ||
        typeof value.inferred !== 'boolean' ||
        !Array.isArray(value.categories) ||
        value.categories.length > 10
      )
        throw fail('Detail deteksi teknologi tidak valid.');
      detection = {
        engine: text(value.engine, 100, true),
        confidence: value.confidence,
        inferred: value.inferred,
        description: text(value.description || '', 1000),
        categories: value.categories.map((category) => text(category, 100, true)),
      };
    }
    return {
      name,
      version,
      quadrant: row.quadrant,
      ring: row.ring,
      source: row.source,
      evidence,
      notes,
      ...(detection ? { detection } : {}),
    };
  });
  return { name, owner, url, description, technologies };
}
async function list() {
  await ensureStore();
  return (await pool.query('SELECT id,data,version,updated_at FROM technology_assets ORDER BY name,id')).rows;
}
async function save(id, input) {
  const data = validate(input);
  await ensureStore();
  const result = id
    ? await pool.query(
        'UPDATE technology_assets SET name=$2,data=$3,version=version+1,updated_at=NOW() WHERE id=$1 AND version=$4 RETURNING id,data,version,updated_at',
        [id, data.name, data, input.version],
      )
    : await pool.query(
        'INSERT INTO technology_assets(id,name,data) VALUES($1,$2,$3) RETURNING id,data,version,updated_at',
        [randomUUID(), data.name, data],
      );
  if (!result.rows.length) throw fail('Technology Asset telah berubah. Muat ulang sebelum menyimpan.', 409);
  return result.rows[0];
}
async function remove(id, version) {
  if (!Number.isInteger(version) || version < 1) throw fail('Versi Technology Asset tidak valid.');
  await ensureStore();
  if (!(await pool.query('DELETE FROM technology_assets WHERE id=$1 AND version=$2', [id, version])).rowCount)
    throw fail('Technology Asset telah berubah. Muat ulang terlebih dahulu.', 409);
}
module.exports = { ensureStore, validate, list, save, remove, rings, quadrants };
