const { pool } = require('../config/database');
const { randomUUID } = require('node:crypto');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const transitions = { draft: ['submitted'], submitted: ['reviewed', 'rejected'], reviewed: ['approved', 'rejected'], rejected: ['draft'], approved: ['realizing'], realizing: ['completed'], completed: [] };
function year(value) { const n = Number(value); if (!Number.isInteger(n) || n < 2000 || n > 2200) fail('Tahun harus antara 2000 dan 2200.'); return n; }
function amount(value) { const n = Number(value); if (value === '' || value == null || !Number.isFinite(n) || n < 0 || n > 1e12 || Math.abs(Math.round(n * 100) - n * 100) > 0.001) fail('Nominal tidak valid (maksimal 1 triliun, dua desimal).'); return n; }
function fields(input) {
  const data = {};
  for (const key of ['title', 'department', 'purpose']) { if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 2000) fail('Judul, bagian pengaju dan tujuan wajib diisi (maksimal 2000 karakter).'); data[key] = input[key].trim(); }
  if (!['CAPEX', 'OPEX'].includes(input.type)) fail('Jenis anggaran tidak valid.');
  return { ...data, type: input.type, amount: amount(input.amount) };
}
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS budget_approvers (requester TEXT PRIMARY KEY, approver TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(requester <> approver))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS budget_years (year INTEGER PRIMARY KEY CHECK(year BETWEEN 2000 AND 2200), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS budget_requests (id UUID PRIMARY KEY, year INTEGER NOT NULL REFERENCES budget_years(year), data JSONB NOT NULL); CREATE INDEX IF NOT EXISTS budget_requests_year ON budget_requests(year)`);
}
async function list(value) { const y = year(value); return { years: (await pool.query('SELECT year FROM budget_years ORDER BY year DESC')).rows.map(r => r.year), requests: (await pool.query('SELECT data FROM budget_requests WHERE year=$1 ORDER BY data->>\'createdAt\' DESC', [y])).rows.map(r => r.data) }; }
async function createYear(value) { const y = year(value); const result = await pool.query('INSERT INTO budget_years(year) VALUES($1) ON CONFLICT DO NOTHING RETURNING year', [y]); if (!result.rowCount) fail('Tahun anggaran sudah tersedia.', 409); return { year: y }; }
function event(user, status, note = '') { return { at: new Date().toISOString(), actor: String(user.fullName || user.username), actorId: String(user.username), status, note }; }
async function create(input, user) {
  const y = year(input.year), data = fields(input);
  if (!(await pool.query('SELECT year FROM budget_years WHERE year=$1', [y])).rowCount) fail('Buat tahun anggaran terlebih dahulu.');
  const record = { ...data, id: randomUUID(), year: y, status: 'draft', actual: 0, requesterId: String(user.username), requester: String(user.fullName || user.username), createdAt: new Date().toISOString(), history: [event(user, 'draft', 'Pengajuan dibuat')] };
  await pool.query('INSERT INTO budget_requests(id,year,data) VALUES($1,$2,$3)', [record.id, y, record]); return record;
}
function advance(record, input, user) {
  const target = input.status;
  if (!transitions[record.status]?.includes(target)) fail('Perubahan status tidak diizinkan.', 409);
  if (['reviewed', 'approved', 'rejected'].includes(target)) {
    if (record.approver ? record.approver !== user.username : !['admin', 'approver'].includes(user.role)) fail('Hanya approver yang ditetapkan dapat mereview dan menyetujui.', 403);
    if (record.requesterId === String(user.username)) fail('Pengaju tidak dapat mereview atau menyetujui pengajuannya sendiri.', 403);
  } else if (record.requesterId !== String(user.username) && user.role !== 'admin') fail('Hanya pengaju atau admin dapat melanjutkan proses.', 403);
  const note = String(input.note || '').trim(); if (note.length > 2000) fail('Catatan maksimal 2000 karakter.'); if (target === 'rejected' && !note) fail('Alasan penolakan wajib diisi.');
  if (target === 'completed') { record.actual = amount(input.actual); if (record.actual > record.amount) fail('Realisasi tidak boleh melebihi nilai disetujui.'); }
  return { ...record, status: target, history: [...record.history, event(user, target, note)] };
}
async function update(id, input, user) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail('ID tidak valid.');
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await client.query('SELECT data FROM budget_requests WHERE id=$1 FOR UPDATE', [id]); if (!result.rowCount) fail('Pengajuan tidak ditemukan.', 404); let record = result.rows[0].data;
    if (input.status) {
      if(input.status==='submitted') {
        const assigned=(await client.query('SELECT a.approver, u.role FROM budget_approvers a JOIN app_users u ON u.username=a.approver WHERE a.requester=$1',[record.requesterId])).rows[0];
        if(!assigned || !await require('./permissionService').has(assigned.role,'budget','update')) fail('Admin perlu menetapkan approver dengan hak ubah Anggaran untuk pengaju ini.');
        record={...record,approver:assigned.approver};
      }
      record = advance(record, input, user);
    }
    else { if (record.status !== 'draft') fail('Hanya draft dapat diedit.', 409); if (record.requesterId !== String(user.username) && user.role !== 'admin') fail('Hanya pengaju atau admin dapat mengedit.', 403); record = { ...record, ...fields(input), history: [...record.history, event(user, 'draft', 'Draft diperbarui')] }; }
    await client.query('UPDATE budget_requests SET data=$2 WHERE id=$1', [id, record]); await client.query('COMMIT'); return record;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
module.exports = { ensureStore, year, amount, fields, transitions, advance, list, createYear, create, update };
async function settings() {
  const users=(await pool.query('SELECT username, full_name AS "fullName", role FROM app_users ORDER BY username')).rows;
  const eligible=[];
  for(const user of users) if(await require('./permissionService').has(user.role,'budget','update')) eligible.push(user.username);
  return {users,eligible,assignments:(await pool.query('SELECT requester, approver FROM budget_approvers ORDER BY requester')).rows};
}
async function saveApprover(input,user) {
  const data=await settings();
  if(!data.users.some(u=>u.username===input.requester)) fail('Pengaju tidak ditemukan.');
  if(input.requester===input.approver) fail('Approver harus berbeda dari pengaju.');
  if(!data.eligible.includes(input.approver)) fail('Approver harus memiliki hak ubah Anggaran.');
  await pool.query('INSERT INTO budget_approvers(requester,approver,updated_by) VALUES($1,$2,$3) ON CONFLICT(requester) DO UPDATE SET approver=EXCLUDED.approver,updated_by=EXCLUDED.updated_by,updated_at=NOW()',[input.requester,input.approver,user.username]);
  return settings();
}
module.exports.settings=settings;
module.exports.saveApprover=saveApprover;
