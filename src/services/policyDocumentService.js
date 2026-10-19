const { pool } = require('../config/database');
const storage = require('./storageService');
const access = require('./evidenceAccessService');
const documents = require('./statementDocumentService');
const { randomUUID } = require('node:crypto');
const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function editable(row) {
  if (!row) throw fail('Policy tidak ditemukan.', 404);
  if (!row.attachment_path || !/\.docx$/i.test(row.attachment_name)) throw fail('Editor mendukung dokumen Word .docx. Konversikan file .doc ke .docx terlebih dahulu.');
}
async function load(id, user) {
  const row = (await pool.query('SELECT *,updated_at::text AS document_revision FROM policy_register WHERE id=$1', [id])).rows[0];
  editable(row);
  await access.assertAccess(row.attachment_path, user);
  const buffer = await storage.read(row.attachment_path);
  return { buffer: await documents.forEditor(buffer), revision: row.document_revision, name: row.attachment_name };
}
async function save(id, user, file, revision) {
  if (!file || !/\.docx$/i.test(file.originalname) || typeof revision !== 'string' || revision.length > 100) throw fail('Dokumen atau versi tidak valid.');
  await documents.inspect(file.buffer);
  if (!await require('./permissionService').hasFileAction(user?.role, 'create')) throw fail('Izin tambah file diperlukan untuk menyimpan dokumen.', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT *,updated_at::text AS document_revision FROM policy_register WHERE id=$1 FOR UPDATE', [id])).rows[0];
    editable(row);
    if (row.document_revision !== revision) throw fail('Policy berubah. Tutup editor dan buka kembali sebelum menyimpan.', 409);
    await access.assertAccess(row.attachment_path, user);
    // Save a separate version: other records may reference the original file.
    const target = `policy-register/${randomUUID()}.docx`;
    await storage.put(target, { buffer: file.buffer, name: row.attachment_name, mimeType: mime, uploadedBy: await access.userId(user) });
    await client.query("UPDATE policy_register SET attachment_path=$2,attachment_type=$3,approval_status='Draft',updated_at=now() WHERE id=$1", [id, target, mime]);
    await client.query('COMMIT');
    return { saved: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { load, save, editable, mime };
