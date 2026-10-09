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
function fileModule(filePath) {
  const parts=String(filePath||'').split('/'),folder=parts[0];
  if(folder==='Asset Management')return parts[1]==='racks'?'Rak Server':'Asset Register';
  if(folder==='Knowledge Notes')return 'Knowledge Notes';
  if(/^TPRM/i.test(folder))return 'TPRM';
  if(folder==='audit-finding')return 'Audit Finding';
  return folder||'Uploaded files';
}
async function list(user) {
  const id = await userId(user);
  const result = await pool.query(`SELECT path, name, mime_type AS type, open_page AS "openPage", uploaded_by AS "uploadedBy", updated_at AS "updatedAt" FROM evidence_files ${user.role === 'admin' ? '' : 'WHERE uploaded_by=$1'} ORDER BY name,path`, user.role === 'admin' ? [] : [id]);
  return result.rows.map(row => ({ ...row, path: `upload/${row.path}`, source: fileModule(row.path), module: fileModule(row.path) }));
}
async function assertAccess(value, user) {
  const normalized = normalize(value);
  const id = await userId(user);
  const result = await pool.query('SELECT uploaded_by FROM evidence_files WHERE path=$1', [normalized]);
  if (!result.rows[0] || (user.role !== 'admin' && String(result.rows[0].uploaded_by) !== String(id))) throw invalid('Evidence tidak tersedia atau bukan file yang Anda upload.');
  return normalized;
}
async function searchableList(user) {
  const files = await list(user);
  if (!files.length) return files;
  const paths = files.map(file=>normalize(file.path));
  const result = await pool.query(`SELECT regexp_replace(p.attachment_path, '^(uploads?)/', '') AS path,
    p.title, p.notes, i.subtitle, i.content
    FROM policy_register p LEFT JOIN policy_register_items i ON i.policy_id=p.id
    WHERE regexp_replace(p.attachment_path, '^(uploads?)/', '') = ANY($1::text[])
    ORDER BY p.id, i.sort_order, i.id`, [paths]);
  const details = new Map();
  for (const row of result.rows) {
    if (!details.has(row.path)) details.set(row.path, []);
    details.get(row.path).push({title:row.title,notes:row.notes || '',subtitle:row.subtitle || '',content:row.content || ''});
  }
  const knowledge = new Map();
  if (await require('./permissionService').has(user?.role, 'knowledge-notes', 'read')) {
    const linked = await pool.query(`SELECT DISTINCT regexp_replace(p.attachment_path, '^(uploads?)/', '') AS path,
      n.id, n.title, n.folder, n.content
      FROM policy_register p
      JOIN knowledge_notes n ON p.related_note_ids @> jsonb_build_array(n.id::text)
        OR p.related_note_ids @> jsonb_build_array(n.id)
      WHERE regexp_replace(p.attachment_path, '^(uploads?)/', '') = ANY($1::text[])
      ORDER BY path, n.id`, [paths]);
    for (const row of linked.rows) {
      if (!knowledge.has(row.path)) knowledge.set(row.path, []);
      knowledge.get(row.path).push({id:row.id,title:row.title,folder:row.folder,content:row.content});
    }
  }
  return files.map(file=>({...file,source:details.has(normalize(file.path)) ? 'Policy Register' : file.source,policyDetails:details.get(normalize(file.path)) || [],knowledgeDetails:knowledge.get(normalize(file.path)) || []}));
}
async function assertReadAccess(value, user) {
  if(!await require('./permissionService').hasFileAction(user?.role,'read')) throw invalid('Read access to files is required.');
  return assertAccess(value, user);
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
  const nextPaths = new Set(next.filter(file => file?.path).map(file => normalize(file.path)));
  for (const filePath of existing) if (!nextPaths.has(filePath)) await assertAccess(filePath, user);
  for (const file of next) {
    if (!file?.path) throw invalid('Evidence wajib memiliki path.', 400);
    if (!existing.has(normalize(file.path))) await assertAccess(file.path, user);
  }
}
module.exports = { fileModule, normalize, userId, list, searchableList, assertAccess, assertReadAccess, canModify, assertReferences };
