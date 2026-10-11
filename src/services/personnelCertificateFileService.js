const crypto = require('node:crypto');
const path = require('node:path');
const { pool } = require('../config/database');
const storage = require('./storageService');
const access = require('./evidenceAccessService');
function validate(file) {
  const b = file?.buffer;
  const invalid = () => { throw Object.assign(new Error('Gunakan sertifikat PDF, PNG, JPEG, atau WebP yang valid, maksimum 5 MB.'), { status: 400 }); };
  if (!Buffer.isBuffer(b) || !b.length || b.length > 5 * 1024 * 1024) invalid();
  if (file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf' && b.subarray(0,5).toString() === '%PDF-') return file.mimetype;
  return require('./assetRackPhotoService').validateFile(file).type;
}
async function saveRequest(req, id) {
  const service = require('./personnelCertificationService');
  let data = req.body;
  if (req.is('multipart/form-data')) {
    try { data = JSON.parse(req.body.data); } catch { throw Object.assign(new Error('Data sertifikasi tidak valid.'), { status: 400 }); }
  }
  // Attachment metadata is managed by the server, never accepted from a request.
  data = { ...data }; delete data.certificateFile;
  if (req.body.removeCertificate === 'true') data.certificateFile = null;
  let uploaded;
  try {
    if (req.file) {
      const type = validate(req.file);
      const name = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-200) || 'certificate';
      uploaded = `Personnel Certification/Certificates/${crypto.randomUUID()}/${name}`;
      await storage.put(uploaded, { buffer: req.file.buffer, name, mimeType: type, uploadedBy: await access.userId(req.user) });
      data.certificateFile = { path: `upload/${uploaded}`, name, type, size: req.file.buffer.length };
    }
    return await (id ? service.update(id,data) : service.create(data));
  } catch (error) {
    if (uploaded) { await storage.remove(uploaded).catch(() => {}); await pool.query('DELETE FROM evidence_files WHERE path=$1',[uploaded]).catch(() => {}); }
    throw error;
  }
}
async function read(id) {
  if (!/^[1-9]\d*$/.test(String(id))) throw Object.assign(new Error('ID sertifikasi tidak valid.'), {status:400});
  const result = await pool.query('SELECT certificate_file FROM personnel_certifications WHERE id=$1',[id]);
  const file = result.rows[0]?.certificate_file;
  if (!file?.path) throw Object.assign(new Error('Sertifikat belum diunggah.'), { status:404 });
  const contents = await require('./fileService').readFile(access.normalize(file.path));
  return { ...contents, name:file.name };
}
module.exports = { validate, saveRequest, read };
