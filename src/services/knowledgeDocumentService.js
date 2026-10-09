const { randomUUID } = require('node:crypto');
const path = require('node:path');
function validate(document) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!document || typeof document.path !== 'string') fail('Path file catatan wajib diisi.');
  require('./knowledgeNoteService').validateFolder(document.path);
  if (!/\.(md|txt|json)$/i.test(document.path)) fail('Gunakan file MD, TXT, atau JSON.');
  if (!Buffer.isBuffer(document.content) || !document.content.length || document.content.length > 10 * 1024 * 1024) fail('File catatan maksimal 10 MB.');
  return document;
}
async function store(client, document) {
  validate(document);
  const name = path.posix.basename(document.path);
  const filePath = `Knowledge Notes/imports/${randomUUID()}/${document.path}`;
  require('./storageService').normalizePath(filePath);
  await client.query('INSERT INTO evidence_files(path,name,content,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5)', [filePath, name, document.content, /\.json$/i.test(name) ? 'application/json' : 'text/plain', document.uploadedBy || null]);
  return filePath;
}
module.exports = { validate, store };
