const { randomUUID } = require('node:crypto');
const { pool } = require('../config/database');
const { normalize } = require('./complianceService');
const { validateUploadFile } = require('./fileService');
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
function parse(input) {
  if (typeof input?.data !== 'string') return input;
  try { return JSON.parse(input.data); } catch { throw invalid('Data pelaporan tidak valid.'); }
}
function validateFiles(files, status) {
  if (!Array.isArray(files) || files.length > 10) throw invalid('Maksimum 10 file bukti per pelaporan.');
  if (files.length && status !== 'Sudah dilaporkan') throw invalid('Pilih status Sudah dilaporkan untuk mengunggah bukti pelaporan.');
  return files.map(file => {
    const name = String(file.originalname || '').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 240);
    if (!name || !Buffer.isBuffer(file.buffer) || file.buffer.length < 1 || file.buffer.length > 10 * 1024 * 1024) throw invalid('File harus berisi data, maksimum 10 MB per file.');
    validateUploadFile(name, file.mimetype);
    return { name, content: file.buffer, mimeType: file.mimetype };
  });
}
async function save(id, input, uploads = []) {
  const data = normalize('reports', parse(input));
  const files = validateFiles(uploads, data.status);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reportId = id || randomUUID();
    if (id && !(await client.query('SELECT id FROM compliance_reports WHERE id=$1 FOR UPDATE', [id])).rows.length) throw invalid('Pelaporan tidak ditemukan.', 404);
    const count = (await client.query('SELECT COUNT(*)::int AS count FROM compliance_report_files WHERE report_id=$1', [reportId])).rows[0].count;
    if (count + files.length > 10) throw invalid('Maksimum 10 file bukti per pelaporan.');
    const row = id
      ? (await client.query('UPDATE compliance_reports SET data=$2,updated_at=NOW() WHERE id=$1 RETURNING id,data', [id, data])).rows[0]
      : (await client.query('INSERT INTO compliance_reports(id,data) VALUES($1,$2) RETURNING id,data', [reportId, data])).rows[0];
    for (const file of files) await client.query('INSERT INTO compliance_report_files(id,report_id,name,mime_type,content) VALUES($1,$2,$3,$4,$5)', [randomUUID(), reportId, file.name, file.mimeType, file.content]);
    await client.query('COMMIT');
    return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function list(reportId) {
  return (await pool.query('SELECT id,name,octet_length(content) AS size FROM compliance_report_files WHERE report_id=$1 ORDER BY created_at,id', [reportId])).rows;
}
async function download(reportId, fileId) {
  const file = (await pool.query('SELECT name,mime_type AS "mimeType",content FROM compliance_report_files WHERE report_id=$1 AND id=$2', [reportId, fileId])).rows[0];
  if (!file) throw invalid('Bukti pelaporan tidak ditemukan.', 404);
  return file;
}
async function remove(reportId, fileId) {
  const result = await pool.query('DELETE FROM compliance_report_files WHERE report_id=$1 AND id=$2', [reportId, fileId]);
  if (!result.rowCount) throw invalid('Bukti pelaporan tidak ditemukan.', 404);
}
module.exports = { parse, validateFiles, save, list, download, remove };
