const { pool } = require('../config/database');
const storage = require('./storageService');
const invalid = (message, status = 403) => Object.assign(new Error(message), { status });
function normalize(value) {
  if (typeof value !== 'string') throw invalid('Path evidence tidak valid.', 400);
  return storage.normalizePath(value.replace(/^(uploads?)\//, ''));
}
async function userId(user) {
  if (!user?.username) throw invalid('Authentication required', 401);
  const result = await pool.query('SELECT id FROM app_users WHERE username=$1', [user.username]);
  if (!result.rows[0]) throw invalid('User tidak ditemukan.', 401);
  return result.rows[0].id;
}
async function list(user) {
  const id = await userId(user);
  const result = await pool.query(`SELECT path, name, mime_type AS type, open_page AS "openPage", uploaded_by AS "uploadedBy", updated_at AS "updatedAt" FROM evidence_files ${user.role === 'admin' ? '' : 'WHERE uploaded_by=$1'} ORDER BY name,path`, user.role === 'admin' ? [] : [id]);
  return result.rows.map(row => ({ ...row, path: `upload/${row.path}`, source: 'Uploaded files' }));
}
async function assertAccess(value, user) {
  const normalized = normalize(value);
  const id = await userId(user);
  const result = await pool.query('SELECT uploaded_by FROM evidence_files WHERE path=$1', [normalized]);
  if (!result.rows[0] || (user.role !== 'admin' && String(result.rows[0].uploaded_by) !== String(id))) throw invalid('Evidence tidak tersedia atau bukan file yang Anda upload.');
  return normalized;
}
async function assertReadAccess(value, user) {
  const normalized = normalize(value);
  await userId(user);
  const result = await pool.query('SELECT 1 FROM evidence_files WHERE path=$1', [normalized]);
  if (!result.rows[0]) throw invalid('Evidence tidak tersedia.', 404);
  return normalized;
}
async function canModify(value, user) {
  const normalized = normalize(value);
  const id = await userId(user);
  const result = await pool.query('SELECT uploaded_by FROM evidence_files WHERE path=$1', [normalized]);
  if (!result.rows[0]) throw invalid('Evidence tidak tersedia.', 404);
  return user.role === 'admin' || String(result.rows[0].uploaded_by) === String(id);
}
async function assertReferences(next, previous, user) {
  if (!Array.isArray(next)) throw invalid('Daftar evidence tidak valid.', 400);
  const existing = new Set((Array.isArray(previous) ? previous : []).filter(file => file?.path).map(file => normalize(file.path)));
  for (const file of next) {
    if (!file?.path) throw invalid('Evidence wajib memiliki path.', 400);
    if (!existing.has(normalize(file.path))) await assertAccess(file.path, user);
  }
}
module.exports = { normalize, userId, list, assertAccess, assertReadAccess, canModify, assertReferences };
