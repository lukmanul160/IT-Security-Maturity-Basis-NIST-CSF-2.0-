const { pool } = require('../config/database');
const { randomUUID } = require('node:crypto');
const evidenceAccess = require('./evidenceAccessService');
const files = require('./fileService');
const fs = require('node:fs/promises');
const path = require('node:path');
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
  if(kind==='finding'||kind==='audit'){
    result.status = kind==='audit'?'Open':data.status || 'Open';
    if (!statuses.includes(result.status)) fail('Status tidak valid');
  }
  result.severity = data.severity || 'Medium';
  if (!['Low', 'Medium', 'High', 'Critical'].includes(result.severity)) fail('Severity tidak valid');
  result.dueDate = kind==='finding' ? data.dueDate || '' : '';
  if(kind==='finding'){
    result.ownerEmail=String(data.ownerEmail||'').trim().toLowerCase();
    if(result.ownerEmail&&(result.ownerEmail.length>254||!require('./smtpService').email(result.ownerEmail)))fail('Email PIC / owner finding tidak valid.');
    if(result.ownerEmail&&!result.owner)fail('Isi PIC / owner untuk email finding.');
  }
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
  await pool.query(await fs.readFile(path.join(__dirname, '../../database/audit-evidence-files.sql'), 'utf8'));
  await pool.query(`UPDATE audit_finding_records a SET data=jsonb_set(a.data,'{status}',to_jsonb(CASE
    WHEN NOT EXISTS(SELECT 1 FROM audit_finding_records f WHERE f.parent_id=a.id AND f.kind='finding') THEN 'Open'
    WHEN NOT EXISTS(SELECT 1 FROM audit_finding_records f WHERE f.parent_id=a.id AND f.kind='finding' AND f.data->>'status' IS DISTINCT FROM 'Closed') THEN 'Closed'
    WHEN EXISTS(SELECT 1 FROM audit_finding_records f WHERE f.parent_id=a.id AND f.kind='finding' AND f.data->>'status' IN ('In progress','Closed')) THEN 'In progress'
    ELSE 'Open' END::text)) WHERE a.kind='audit'`);
}
async function syncAuditStatus(client,id){
  if(!id)return;
  const result=await client.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER(WHERE data->>'status'='Closed')::int AS closed,
    COUNT(*) FILTER(WHERE data->>'status' IN ('Closed','In progress'))::int AS started
    FROM audit_finding_records WHERE parent_id=$1 AND kind='finding'`,[id]);
  const counts=result.rows[0];
  const status=counts.total>0&&counts.closed===counts.total?'Closed':counts.started>0?'In progress':'Open';
  await client.query(`UPDATE audit_finding_records SET data=jsonb_set(data,'{status}',to_jsonb($2::text)),updated_at=NOW() WHERE id=$1 AND kind='audit' AND data->>'status' IS DISTINCT FROM $2`,[id,status]);
}
const projection = `id, kind, parent_id AS "parentId", data, filename, octet_length(content) AS size, updated_at AS "updatedAt", created_at AS "createdAt"`;
function attachments(row) {
  if (Array.isArray(row.data?.attachments)) return row.data.attachments;
  return row.data?.attachmentPath ? [{path:row.data.attachmentPath,name:row.filename || row.data.attachmentPath.split('/').pop()}] : [];
}
async function list(user) {
  const rows = (await pool.query(`SELECT ${projection} FROM audit_finding_records ORDER BY created_at, id`)).rows;
  if (!user) return rows;
  const owned = new Set((await evidenceAccess.list(user)).map(file => evidenceAccess.normalize(file.path)));
  return rows.map(row => {
    const items = attachments(row).map(file => ({...file,canManageFile:owned.has(file.path)}));
    return {...row,attachments:items,canManageFile:row.kind === 'evidence' && items.every(file=>file.canManageFile)};
  });
}
async function save(kind, id, parentId, input, file, user) {
  const data = normalize(kind, input);
  const uploads = Array.isArray(file) ? file : file ? [file] : [];
  if (uploads.length && user && !await require('./permissionService').hasFileAction(user.role,'create')) fail('Add access to files is required.',403);
  if (uploads.length > 10 || uploads.some(item => kind !== 'evidence' || !item.size || item.size > 10 * 1024 * 1024)) fail('Maksimum 10 file, masing-masing 1 byte hingga 10 MB.');
  let removed = [];
  try { removed = input.removeAttachments === undefined ? [] : JSON.parse(input.removeAttachments); } catch { fail('Daftar file yang dihapus tidak valid.'); }
  if (!Array.isArray(removed) || removed.some(value=>typeof value !== 'string')) fail('Daftar file yang dihapus tidak valid.');
  let selected = [];
  try { selected = input.existingAttachments === undefined ? [] : JSON.parse(input.existingAttachments); } catch { fail('Pilihan file tidak valid.'); }
  if (!Array.isArray(selected) || selected.length > 10 || selected.some(value=>typeof value !== 'string')) fail('Pilih maksimal 10 file yang valid.');
  selected = [...new Set(selected.map(value=>evidenceAccess.normalize(value)))];
  if (kind !== 'evidence' && selected.length) fail('Pilihan lampiran hanya untuk Evidence.');
  let retained = [];
  if (kind === 'evidence' && !id && !uploads.length && !selected.length) fail('Upload atau pilih minimal satu file evidence.');
  const uploaderId = kind === 'evidence' ? await evidenceAccess.userId(user) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deletion takes an exclusive table lock first; use the same lock order.
    await client.query('LOCK TABLE audit_finding_records IN ROW EXCLUSIVE MODE');
    const ancestors=await client.query(`WITH RECURSIVE ancestors AS (
      SELECT id,kind,parent_id FROM audit_finding_records WHERE id=$1
      UNION ALL SELECT p.id,p.kind,p.parent_id FROM audit_finding_records p JOIN ancestors c ON p.id=c.parent_id
    ) SELECT id FROM ancestors WHERE kind='audit'`,[id||parentId||null]);
    const auditId=ancestors.rows[0]?.id;
    if(auditId)await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`audit-finding-status:${auditId}`]);
    if (id) {
      const existing = (await client.query('SELECT kind, parent_id, data, filename FROM audit_finding_records WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!existing || existing.kind !== kind) fail('Data tidak ditemukan', 404);
      if(kind==='finding'&&!Object.hasOwn(input,'ownerEmail')&&data.owner===existing.data.owner)data.ownerEmail=existing.data.ownerEmail||'';
      parentId = existing.parent_id;
      if (kind === 'evidence') {
        retained = attachments(existing);
        for (const item of retained) await evidenceAccess.assertAccess(item.path, user);
        if (removed.some(value=>!retained.some(item=>item.path===value))) fail('File yang dihapus bukan lampiran evidence ini.');
        retained = retained.filter(item=>!removed.includes(item.path));
      }
    }
    if (kind !== 'audit') {
      const parent = (await client.query('SELECT kind FROM audit_finding_records WHERE id=$1 FOR SHARE', [parentId || null])).rows[0];
      if (parent?.kind !== kinds[kinds.indexOf(kind) - 1]) fail('Induk tidak sesuai urutan Audit → Finding → Follow-up → Evidence');
    } else if (parentId) fail('Audit tidak memiliki induk');
    const recordId = id || randomUUID();
    for (const selectedPath of selected) {
      const stored = (await client.query('SELECT name, uploaded_by, octet_length(content) AS size FROM evidence_files WHERE path=$1 FOR SHARE', [selectedPath])).rows[0];
      if (!stored || (user.role !== 'admin' && String(stored.uploaded_by) !== String(uploaderId))) fail('File tidak tersedia atau bukan file yang Anda upload.',403);
      if (!retained.some(item=>item.path === selectedPath)) retained.push({path:selectedPath,name:stored.name,size:stored.size});
    }
    for (const upload of uploads) {
      const name = upload.originalname.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 240);
      const attachmentPath = `audit-finding/${recordId}/${randomUUID()}/${name}`;
      let mimeType = 'application/octet-stream';
      try { files.validateUploadFile(name, upload.mimetype); mimeType = upload.mimetype; } catch {}
      await client.query('INSERT INTO evidence_files(path,name,content,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5)', [attachmentPath, name, upload.buffer, mimeType, uploaderId]);
      retained.push({path:attachmentPath,name,size:upload.size});
    }
    if (kind === 'evidence') {
      if ((!id && !retained.length) || retained.length > 10) fail('Evidence baru harus memiliki minimal satu file; maksimum 10 file.');
      data.attachments = retained;
      if (retained.length) data.attachmentPath = retained[0].path;
    }
    const filename = retained[0]?.name || null;
    const result = id
      ? await client.query(`UPDATE audit_finding_records SET data=$2, updated_at=NOW(), filename=$3, content=$4 WHERE id=$1 RETURNING ${projection}`, [id, data, filename, null])
      : await client.query(`INSERT INTO audit_finding_records(id,kind,parent_id,data,filename,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${projection}`, [recordId, kind, parentId || null, data, filename, null]);
    await syncAuditStatus(client,kind==='audit'?recordId:kind==='finding'?parentId:null);
    if(kind==='audit')result.rows[0]=(await client.query(`SELECT ${projection} FROM audit_finding_records WHERE id=$1`,[recordId])).rows[0];
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function remove(id, user) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Freeze hierarchy writes while permissions are checked and children are deleted.
    await client.query('LOCK TABLE audit_finding_records IN EXCLUSIVE MODE');
    const subtree=(await client.query(`WITH RECURSIVE subtree AS (
      SELECT id,kind,data,filename,0 AS depth FROM audit_finding_records WHERE id=$1
      UNION ALL SELECT child.id,child.kind,child.data,child.filename,parent.depth+1
      FROM audit_finding_records child JOIN subtree parent ON child.parent_id=parent.id
    ) SELECT * FROM subtree ORDER BY depth DESC,id`,[id])).rows;
    const row=subtree.find(item=>Number(item.depth)===0);
    if(!row)fail('Data tidak ditemukan',404);
    const parentId=row.kind==='finding'?(await client.query('SELECT parent_id FROM audit_finding_records WHERE id=$1',[id])).rows[0].parent_id:null;
    const permissions = require('./permissionService');
    if (user && !await permissions.has(user.role,'audit-finding-tracker','delete')) fail('Role tidak memiliki izin hapus.',403);
    for(const record of subtree)if(record.kind==='evidence')for(const item of attachments(record))await evidenceAccess.assertAccess(item.path,user);
    // Removing references never deletes the main files from Uploaded files.
    for(const record of subtree)await client.query('DELETE FROM audit_finding_records WHERE id=$1',[record.id]);
    await syncAuditStatus(client,parentId);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally{client.release();}
}
async function download(id, user, requestedPath) {
  const row = (await pool.query("SELECT filename, data FROM audit_finding_records WHERE id=$1 AND kind='evidence'", [id])).rows[0];
  if (!row) fail('Evidence tidak ditemukan', 404);
  const item = requestedPath ? attachments(row).find(file=>file.path===requestedPath) : attachments(row)[0];
  if (!item) fail('File bukan lampiran evidence ini.',404);
  await evidenceAccess.assertReadAccess(item.path, user);
  return { filename:item.name, content:(await files.readFile(item.path)).content };
}
module.exports = { ensureStore, list, save, remove, download, normalize };
