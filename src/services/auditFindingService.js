const { pool } = require('../config/database');
const { randomUUID } = require('node:crypto');
const kinds = ['audit', 'finding', 'followup', 'evidence'];
const statuses = ['Open', 'In progress', 'Closed'];
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function normalize(kind, data) {
  if (!kinds.includes(kind)) fail('Jenis data tidak valid');
  const result = {};
  for (const [key, max] of Object.entries({ title: 200, reference: 100, owner: 160, description: 10000 })) {
    result[key] = String(data[key] || '').trim();
    if (result[key].length > max) fail(`${key} terlalu panjang`);
  }
  if (!result.title) fail('Judul wajib diisi');
  result.status = data.status || 'Open';
  if (!statuses.includes(result.status)) fail('Status tidak valid');
  result.severity = data.severity || 'Medium';
  if (!['Low', 'Medium', 'High', 'Critical'].includes(result.severity)) fail('Severity tidak valid');
  result.dueDate = data.dueDate || '';
  if (result.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.dueDate) || Number.isNaN(Date.parse(result.dueDate)) || new Date(result.dueDate).toISOString().slice(0, 10) !== result.dueDate)) fail('Tanggal tidak valid');
  return result;
}
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_finding_records (
    id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('audit','finding','followup','evidence')),
    parent_id UUID REFERENCES audit_finding_records(id) ON DELETE RESTRICT,
    data JSONB NOT NULL, filename TEXT, content BYTEA, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK ((kind = 'audit') = (parent_id IS NULL))
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS audit_finding_parent_idx ON audit_finding_records(parent_id)');
}
const projection = `id, kind, parent_id AS "parentId", data, filename, octet_length(content) AS size, updated_at AS "updatedAt"`;
async function list() { return (await pool.query(`SELECT ${projection} FROM audit_finding_records ORDER BY created_at, id`)).rows; }
async function save(kind, id, parentId, input, file) {
  const data = normalize(kind, input);
  if (file && (kind !== 'evidence' || !file.size || file.size > 10 * 1024 * 1024)) fail('Evidence harus berukuran 1 byte hingga 10 MB');
  if (kind === 'evidence' && !id && !file) fail('File evidence wajib diunggah');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (id) {
      const existing = (await client.query('SELECT kind, parent_id FROM audit_finding_records WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!existing || existing.kind !== kind) fail('Data tidak ditemukan', 404);
      parentId = existing.parent_id;
    }
    if (kind !== 'audit') {
      const parent = (await client.query('SELECT kind FROM audit_finding_records WHERE id=$1 FOR SHARE', [parentId || null])).rows[0];
      if (parent?.kind !== kinds[kinds.indexOf(kind) - 1]) fail('Induk tidak sesuai urutan Audit → Finding → Follow-up → Evidence');
    } else if (parentId) fail('Audit tidak memiliki induk');
    const filename = file ? file.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 240) : null;
    const result = id
      ? await client.query(`UPDATE audit_finding_records SET data=$2, updated_at=NOW(), filename=COALESCE($3,filename), content=COALESCE($4,content) WHERE id=$1 RETURNING ${projection}`, [id, data, filename, file?.buffer || null])
      : await client.query(`INSERT INTO audit_finding_records(id,kind,parent_id,data,filename,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${projection}`, [randomUUID(), kind, parentId || null, data, filename, file?.buffer || null]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function remove(id) {
  try {
    const result = await pool.query('DELETE FROM audit_finding_records WHERE id=$1', [id]);
    if (!result.rowCount) fail('Data tidak ditemukan', 404);
  } catch (error) { if (['23503', '23001'].includes(error.code)) fail('Hapus data turunan terlebih dahulu', 409); throw error; }
}
async function download(id) {
  const row = (await pool.query("SELECT filename, content FROM audit_finding_records WHERE id=$1 AND kind='evidence'", [id])).rows[0];
  if (!row) fail('Evidence tidak ditemukan', 404);
  return row;
}
module.exports = { ensureStore, list, save, remove, download, normalize };
