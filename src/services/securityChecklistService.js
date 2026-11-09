/** Custom checklist definitions and assigned assessments, persisted in PostgreSQL.
 * Version checks prevent a stale editor from overwriting another assessor's work.
 */
const { randomUUID } = require('node:crypto');
const { pool } = require('../config/database');
const { validateUploadFile } = require('./fileService');
const permissions = require('./permissionService');
const key = 'compliance-security-checklist';
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });
const defaults = [
  ['id', 'ID', 'definition'],
  ['area', 'Area', 'definition'],
  ['how', 'How To Produce', 'definition'],
  ['expected', 'Expected Result', 'definition'],
  ['status', 'Status', 'assessment'],
  ['evidence', 'Evidence / temuan', 'assessment'],
  ['pic', 'PIC / Target', 'assessment'],
].map(([id, label, phase]) => ({
  id,
  label,
  phase,
  type: id === 'status' ? 'select' : id === 'evidence' ? 'evidence' : 'text',
  options:
    id === 'status' ? ['Belum dinilai', 'Dalam proses', 'Sesuai', 'Tidak sesuai', 'Tidak berlaku'] : [],
}));
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS compliance_security_checklists (
    id UUID PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, assessor TEXT NOT NULL,
    data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(
    "ALTER TABLE compliance_security_checklists ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'assignment', ADD COLUMN IF NOT EXISTS template_id UUID, ADD COLUMN IF NOT EXISTS template_title TEXT NOT NULL DEFAULT ''",
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS compliance_security_checklist_files (
    id UUID PRIMARY KEY, checklist_id UUID NOT NULL REFERENCES compliance_security_checklists(id) ON DELETE CASCADE,
    row_id TEXT NOT NULL, column_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
    content BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw invalid('Isian checklist tidak valid atau terlalu panjang.');
  return value.trim();
}
function validate(input) {
  if (!input || !Number.isInteger(input.version) || input.version < 0)
    throw invalid('Versi checklist tidak valid.');
  const title = text(input.title, 200, true),
    assessor = text(input.assessor, 200, true);
  if (!Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 30)
    throw invalid('Gunakan 1–30 kolom.');
  const ids = new Set();
  const columns = input.columns.map((c) => {
    if (
      !c ||
      typeof c.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) ||
      ids.has(c.id) ||
      !['text', 'select', 'evidence'].includes(c.type) ||
      !['definition', 'assessment'].includes(c.phase)
    )
      throw invalid('Kolom tidak valid atau ID kolom duplikat.');
    ids.add(c.id);
    const label = text(c.label, 100, true);
    if (!Array.isArray(c.options) || c.options.length > 30) throw invalid('Pilihan kolom tidak valid.');
    const options = c.type === 'select' ? c.options.map((o) => text(o, 100, true)) : [];
    if (c.type === 'select' && (!options.length || new Set(options).size !== options.length))
      throw invalid('Kolom pilihan membutuhkan opsi unik.');
    return { id: c.id, label, phase: c.phase, type: c.type, options };
  });
  if (!Array.isArray(input.rows) || input.rows.length > 500) throw invalid('Maksimum 500 baris checklist.');
  const rowIds = new Set();
  const rows = input.rows.map((r) => {
    if (!r || typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || rowIds.has(r.id))
      throw invalid('ID baris tidak valid atau duplikat.');
    rowIds.add(r.id);
    const values = Object.fromEntries(
      columns.map((c) => {
        const value = text(r.values?.[c.id] ?? '', 4000);
        if (value && c.type === 'select' && !c.options.includes(value))
          throw invalid('Nilai tidak tersedia pada pilihan kolom.');
        return [c.id, value];
      }),
    );
    return { id: r.id, values };
  });
  return { title, assessor, version: input.version, columns, rows };
}
const manages = (row, user) => user.role === 'admin' || row.owner === user.username;
function authorize(row, user, assessment = false) {
  if (!manages(row, user) && !(assessment && row.assessor === user.username))
    throw invalid(
      'Hanya pembuat/admin yang dapat mengatur checklist; hasil diisi oleh assessor yang ditugaskan.',
      403,
    );
}
/** Reject unauthorized record updates before multipart bodies are buffered. Rechecked under lock in save. */
async function authorizeUpload(id, user, assessment = false) {
  await ensureStore();
  const row = (
    await pool.query('SELECT owner,assessor,kind FROM compliance_security_checklists WHERE id=$1', [id])
  ).rows[0];
  if (!row) throw invalid('Checklist tidak ditemukan.', 404);
  authorize(row, user, assessment);
  if (assessment && row.kind === 'template')
    throw invalid('Buat assignment dari template sebelum mengisi asesmen.');
}
function validateFileSignature(name, buffer) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  const starts = (bytes) => buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  const valid =
    extension === '.pdf'
      ? starts([0x25, 0x50, 0x44, 0x46, 0x2d])
      : extension === '.png'
        ? starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : ['.jpg', '.jpeg'].includes(extension)
          ? starts([0xff, 0xd8, 0xff])
          : extension === '.gif'
            ? ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
            : extension === '.webp'
              ? buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
                buffer.subarray(8, 12).toString('ascii') === 'WEBP'
              : ['.doc', '.ppt', '.xls'].includes(extension)
                ? starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                : ['.docx', '.pptx', '.xlsx'].includes(extension) && starts([0x50, 0x4b, 0x03, 0x04]);
  if (!valid) throw invalid('Isi file tidak sesuai dengan format evidence yang dipilih.');
}
async function users() {
  const result = await pool.query(
    'SELECT username, full_name AS "fullName", role FROM app_users ORDER BY username',
  );
  const eligible = [];
  for (const user of result.rows)
    if (await permissions.has(user.role, key, 'update'))
      eligible.push({ username: user.username, fullName: user.fullName });
  return eligible;
}
async function list(user) {
  await ensureStore();
  const records = (
    await pool.query(
      "SELECT * FROM compliance_security_checklists WHERE kind='template' OR owner=$1 OR assessor=$1 OR $2 ORDER BY updated_at DESC",
      [user.username, user.role === 'admin'],
    )
  ).rows;
  const files = (
    await pool.query(
      'SELECT id,checklist_id,row_id,column_id,name,octet_length(content) AS size FROM compliance_security_checklist_files WHERE checklist_id=ANY($1::uuid[]) ORDER BY created_at,id',
      [records.map((r) => r.id)],
    )
  ).rows;
  return records.map((row) => ({ ...row, files: files.filter((f) => f.checklist_id === row.id) }));
}
function parseInput(body) {
  if (typeof body?.data !== 'string') return body;
  try {
    return JSON.parse(body.data);
  } catch {
    throw invalid('Data checklist tidak valid.');
  }
}
function validateUploads(uploads, input) {
  if (!Array.isArray(uploads) || uploads.length > 10)
    throw invalid('Maksimum 10 file evidence per checklist.');
  const targets = input?.fileTargets || [];
  if (!Array.isArray(targets) || targets.length !== uploads.length)
    throw invalid('Tujuan file evidence tidak valid.');
  return uploads.map((file, index) => {
    const target = targets[index];
    if (!target || typeof target.rowId !== 'string' || typeof target.columnId !== 'string')
      throw invalid('Tujuan file evidence tidak valid.');
    const name = String(file.originalname || '')
      .replace(/[\x00-\x1f\x7f/\\]/g, '_')
      .slice(0, 240);
    if (
      !name ||
      !Buffer.isBuffer(file.buffer) ||
      !file.buffer.length ||
      file.buffer.length > 10 * 1024 * 1024
    )
      throw invalid('File harus berisi data, maksimum 10 MB per file.');
    const excelMime = /\.xlsx$/i.test(name)
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : /\.xls$/i.test(name)
        ? 'application/vnd.ms-excel'
        : null;
    if (excelMime && file.mimetype !== excelMime)
      throw invalid('Hanya file Excel .xls atau .xlsx dengan tipe yang sesuai yang diizinkan.');
    if (!excelMime) validateUploadFile(name, file.mimetype);
    validateFileSignature(name, file.buffer);
    return {
      rowId: target.rowId,
      columnId: target.columnId,
      name,
      mime: file.mimetype,
      content: file.buffer,
    };
  });
}
async function download(id, fileId, user) {
  await ensureStore();
  const result = await pool.query(
    `SELECT f.name,f.mime_type AS mime,f.content FROM compliance_security_checklist_files f
    JOIN compliance_security_checklists c ON c.id=f.checklist_id
    WHERE f.checklist_id=$1 AND f.id=$2 AND (c.kind='template' OR c.owner=$3 OR c.assessor=$3 OR $4)`,
    [id, fileId, user.username, user.role === 'admin'],
  );
  if (!result.rows.length) throw invalid('File evidence tidak ditemukan atau akses ditolak.', 404);
  return result.rows[0];
}
async function save(id, input, user, assessment = false, uploads = []) {
  input = parseInput(input);
  const files = validateUploads(uploads, input);
  const removals = input?.removeFiles || [];
  if (!Array.isArray(removals) || removals.length > 10 || removals.some((value) => typeof value !== 'string'))
    throw invalid('Daftar penghapusan evidence tidak valid.');
  await ensureStore();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let previous;
    if (id) {
      previous = (
        await client.query('SELECT * FROM compliance_security_checklists WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!previous) throw invalid('Checklist tidak ditemukan.', 404);
      authorize(previous, user, assessment);
      if (input?.version !== previous.version)
        throw invalid('Checklist telah berubah. Muat ulang sebelum menyimpan.', 409);
    }
    const kind = previous?.kind || (input?.kind === 'assignment' ? 'assignment' : 'template');
    if (assessment && kind === 'template')
      throw invalid('Buat assignment dari template sebelum mengisi asesmen.');
    let data;
    if (assessment) {
      if (!previous || !Array.isArray(input.rows) || input.rows.length !== previous.data.rows.length)
        throw invalid('Baris asesmen tidak sesuai checklist.');
      if (
        input.rows.some(
          (r) =>
            !r ||
            typeof r.id !== 'string' ||
            !r.values ||
            typeof r.values !== 'object' ||
            Array.isArray(r.values),
        )
      )
        throw invalid('Isian baris asesmen tidak valid.');
      const changes = new Map(input.rows.map((r) => [r.id, r.values]));
      if (changes.size !== previous.data.rows.length) throw invalid('Baris asesmen duplikat.');
      const rows = previous.data.rows.map((row) => {
        if (!changes.has(row.id)) throw invalid('Baris asesmen tidak dikenal.');
        const values = changes.get(row.id);
        if (
          !values ||
          Object.keys(values).some(
            (k) => !previous.data.columns.some((c) => c.id === k && c.phase === 'assessment'),
          )
        )
          throw invalid('Assessor hanya dapat mengisi kolom asesmen.', 403);
        return { ...row, values: { ...row.values, ...values } };
      });
      data = validate({
        ...previous.data,
        title: previous.title,
        assessor: previous.assessor,
        version: input.version,
        rows,
      });
    } else {
      if (previous?.kind === 'assignment' && previous.template_id)
        throw invalid(
          'Struktur assignment mengikuti snapshot template. Ubah judul atau assessor melalui pengaturan assignment.',
        );
      data = validate(kind === 'template' ? { ...input, assessor: previous?.owner || user.username } : input);
      if (kind !== 'template' && !(await users()).some((u) => u.username === data.assessor))
        throw invalid('Pilih assessor yang memiliki izin ubah Compliance Security Checklist.');
    }
    if (kind === 'template')
      data.rows = data.rows.map((r) => ({
        ...r,
        values: Object.fromEntries(
          data.columns.map((c) => [c.id, c.phase === 'assessment' ? '' : r.values[c.id]]),
        ),
      }));
    const params = [
      id || randomUUID(),
      data.title,
      data.assessor,
      JSON.stringify({ columns: data.columns, rows: data.rows }),
    ];
    const result = id
      ? await client.query(
          'UPDATE compliance_security_checklists SET title=$2,assessor=$3,data=$4,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *',
          params,
        )
      : await client.query(
          'INSERT INTO compliance_security_checklists(id,title,assessor,data,owner,kind) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [...params, user.username, kind],
        );
    const saved = result.rows[0];
    const existing = (
      await client.query(
        'SELECT id,row_id,column_id FROM compliance_security_checklist_files WHERE checklist_id=$1',
        [saved.id],
      )
    ).rows;
    const columnFor = (columnId) => data.columns.find((c) => c.id === columnId && c.type === 'evidence');
    for (const file of files) {
      const column = columnFor(file.columnId);
      if (
        !column ||
        !data.rows.some((r) => r.id === file.rowId) ||
        (assessment && column.phase !== 'assessment') ||
        (kind === 'template' && column.phase === 'assessment')
      )
        throw invalid('Tujuan file evidence tidak valid atau tidak dapat diubah.', 403);
    }
    for (const fileId of removals) {
      const file = existing.find((f) => f.id === fileId);
      if (
        !file ||
        (assessment && !data.columns.some((c) => c.id === file.column_id && c.phase === 'assessment'))
      )
        throw invalid('Evidence tidak dapat dihapus.', 403);
    }
    const obsolete = existing.filter(
      (f) =>
        removals.includes(f.id) ||
        (kind === 'template' && columnFor(f.column_id)?.phase === 'assessment') ||
        !columnFor(f.column_id) ||
        !data.rows.some((r) => r.id === f.row_id),
    );
    if (existing.length - obsolete.length + files.length > 10)
      throw invalid('Maksimum 10 file evidence per checklist.');
    if (obsolete.length)
      await client.query(
        'DELETE FROM compliance_security_checklist_files WHERE checklist_id=$1 AND id=ANY($2::uuid[])',
        [saved.id, obsolete.map((f) => f.id)],
      );
    for (const file of files)
      await client.query(
        'INSERT INTO compliance_security_checklist_files(id,checklist_id,row_id,column_id,name,mime_type,content) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(), saved.id, file.rowId, file.columnId, file.name, file.mime, file.content],
      );
    saved.files = (
      await client.query(
        'SELECT id,row_id,column_id,name,octet_length(content) AS size FROM compliance_security_checklist_files WHERE checklist_id=$1 ORDER BY created_at,id',
        [saved.id],
      )
    ).rows;
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
/** Assignment snapshots isolate applications and retain existing results when templates change. */
async function createAssignment(input, user) {
  await ensureStore();
  const title = text(input?.title, 200, true),
    assessor = text(input?.assessor, 200, true);
  if (
    typeof input?.templateId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.templateId)
  )
    throw invalid('Pilih template checklist yang valid.');
  if (!(await users()).some((u) => u.username === assessor))
    throw invalid('Pilih assessor yang memiliki izin ubah Compliance Security Checklist.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const template = (
      await client.query(
        "SELECT * FROM compliance_security_checklists WHERE id=$1 AND kind='template' FOR SHARE",
        [input.templateId],
      )
    ).rows[0];
    if (!template) throw invalid('Template checklist tidak ditemukan.', 404);
    const data = validate({ ...template.data, title, assessor, version: 0 });
    data.rows = data.rows.map((r) => ({
      ...r,
      values: Object.fromEntries(
        data.columns.map((c) => [c.id, c.phase === 'definition' ? r.values[c.id] : '']),
      ),
    }));
    const result = (
      await client.query(
        "INSERT INTO compliance_security_checklists(id,title,assessor,data,owner,kind,template_id,template_title) VALUES($1,$2,$3,$4,$5,'assignment',$6,$7) RETURNING *",
        [
          randomUUID(),
          title,
          assessor,
          JSON.stringify({ columns: data.columns, rows: data.rows }),
          user.username,
          template.id,
          template.title,
        ],
      )
    ).rows[0];
    const files = (
      await client.query('SELECT * FROM compliance_security_checklist_files WHERE checklist_id=$1', [
        template.id,
      ])
    ).rows;
    for (const f of files)
      if (data.columns.some((c) => c.id === f.column_id && c.phase === 'definition'))
        await client.query(
          'INSERT INTO compliance_security_checklist_files(id,checklist_id,row_id,column_id,name,mime_type,content) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), result.id, f.row_id, f.column_id, f.name, f.mime_type, f.content],
        );
    result.files = (
      await client.query(
        'SELECT id,row_id,column_id,name,octet_length(content) AS size FROM compliance_security_checklist_files WHERE checklist_id=$1 ORDER BY created_at,id',
        [result.id],
      )
    ).rows;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function updateAssignment(id, input, user) {
  await ensureStore();
  const title = text(input?.title, 200, true),
    assessor = text(input?.assessor, 200, true);
  if (!Number.isInteger(input?.version) || input.version < 1) throw invalid('Versi checklist tidak valid.');
  if (!(await users()).some((u) => u.username === assessor))
    throw invalid('Pilih assessor yang memiliki izin ubah Compliance Security Checklist.');
  const result = await pool.query(
    "UPDATE compliance_security_checklists SET title=$2,assessor=$3,version=version+1,updated_at=NOW() WHERE id=$1 AND kind='assignment' AND version=$4 AND (owner=$5 OR $6) RETURNING *",
    [id, title, assessor, input.version, user.username, user.role === 'admin'],
  );
  if (!result.rowCount)
    throw invalid('Assignment berubah atau Anda tidak berhak mengubahnya. Muat ulang terlebih dahulu.', 409);
  return result.rows[0];
}
async function createTemplate(input, user, uploads) {
  return save(null, { ...parseInput(input), kind: 'template' }, user, false, uploads);
}
async function remove(id, version, user) {
  await ensureStore();
  if (!Number.isInteger(version) || version < 1) throw invalid('Versi checklist tidak valid.');
  const result = await pool.query(
    'DELETE FROM compliance_security_checklists WHERE id=$1 AND version=$2 AND (owner=$3 OR $4)',
    [id, version, user.username, user.role === 'admin'],
  );
  if (!result.rowCount)
    throw invalid(
      'Checklist berubah, tidak ditemukan, atau Anda bukan pembuat. Muat ulang terlebih dahulu.',
      409,
    );
}
module.exports = {
  defaults,
  validate,
  authorize,
  ensureStore,
  list,
  users,
  save,
  remove,
  validateUploads,
  download,
  createTemplate,
  createAssignment,
  updateAssignment,
  authorizeUpload,
};
