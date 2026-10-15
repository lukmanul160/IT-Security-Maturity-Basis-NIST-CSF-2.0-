const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../config/database');
const smtp = require('./smtpService');

const stores = { reports: 'compliance_reports', contacts: 'compliance_contacts' };
const invalid = message => Object.assign(new Error(message), { status: 400 });
function text(input, key, label, max, required = false) {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw invalid(`${label} wajib valid${required ? ' dan diisi' : ''} (maksimum ${max} karakter).`);
  }
  return value.trim();
}
function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function normalize(kind, input) {
  if (!stores[kind] || !input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Data compliance tidak valid.');
  if (kind === 'contacts') {
    const data = {
      name: text(input, 'name', 'Nama instansi / layanan', 200, true),
      category: text(input, 'category', 'Kategori', 100),
      person: text(input, 'person', 'Nama narahubung', 160),
      phone: text(input, 'phone', 'Nomor telepon', 60, true),
      email: text(input, 'email', 'Email', 254),
      notes: text(input, 'notes', 'Catatan', 4000)
    };
    if (!/^[+\d][\d\s()+.\-/#,;a-zA-Z]*$/.test(data.phone) || !/\d/.test(data.phone)) throw invalid('Nomor telepon tidak valid.');
    if (data.email && !smtp.email(data.email)) throw invalid('Email narahubung tidak valid.');
    return data;
  }
  const data = {
    title: text(input, 'title', 'Judul laporan', 200, true),
    recipient: text(input, 'recipient', 'Tujuan pelaporan', 200, true),
    recipientType: text(input, 'recipientType', 'Jenis tujuan', 40, true),
    owner: text(input, 'owner', 'PIC', 160, true),
    dueDate: text(input, 'dueDate', 'Tenggat', 10, true),
    status: input.status ?? 'Belum dilaporkan',
    notes: text(input, 'notes', 'Catatan', 4000),
    reminderEnabled: input.reminderEnabled ?? false,
    useGlobalReminder: input.useGlobalReminder ?? false,
    reminderEmail: text(input, 'reminderEmail', 'Email penerima reminder', 254).toLowerCase(),
    daysBefore: input.daysBefore ?? 7,
    repeatDaily: input.repeatDaily ?? false,
    continueOverdue: input.continueOverdue ?? false,
    smtpAccountId: text(input, 'smtpAccountId', 'Akun SMTP', 100) || 'default'
  };
  if (!['Regulator', 'Induk perusahaan', 'Perusahaan lain'].includes(data.recipientType)) throw invalid('Jenis tujuan pelaporan tidak valid.');
  if (!['Belum dilaporkan', 'Dalam proses', 'Sudah dilaporkan'].includes(data.status)) throw invalid('Status pelaporan tidak valid.');
  if (!calendarDate(data.dueDate)) throw invalid('Tanggal tenggat tidak valid.');
  if (typeof data.reminderEnabled !== 'boolean' || typeof data.repeatDaily !== 'boolean' || !Number.isInteger(data.daysBefore) || data.daysBefore < 0 || data.daysBefore > 365) throw invalid('Jadwal reminder tidak valid (H-0 sampai H-365).');
  if (typeof data.continueOverdue !== 'boolean' || (data.continueOverdue && !data.repeatDaily)) throw invalid('Reminder terus-menerus memerlukan pengulangan setiap hari.');
  if (typeof data.useGlobalReminder !== 'boolean') throw invalid('Pilihan pengaturan reminder tidak valid.');
  if (((data.reminderEnabled && !data.useGlobalReminder) || data.reminderEmail) && !smtp.email(data.reminderEmail)) throw invalid('Isi email penerima reminder yang valid.');
  return data;
}
function table(kind) {
  if (!stores[kind]) throw invalid('Jenis data tidak valid.');
  return stores[kind];
}
async function ensureStore() {
  await pool.query(await fs.readFile(path.join(__dirname, '../../database/compliance.sql'), 'utf8'));
}
async function list(kind) {
  const result = await pool.query(`SELECT id, data, created_at AS "createdAt", updated_at AS "updatedAt" FROM ${table(kind)} ORDER BY created_at DESC, id`);
  if (kind === 'reports' && result.rows.length) {
    const files = (await pool.query('SELECT id,report_id AS "reportId",name,octet_length(content) AS size FROM compliance_report_files WHERE report_id=ANY($1::uuid[]) ORDER BY created_at,id', [result.rows.map(row => row.id)])).rows;
    const byReport = new Map();
    for (const file of files) { if (!byReport.has(file.reportId)) byReport.set(file.reportId, []); byReport.get(file.reportId).push(file); }
    for (const row of result.rows) row.files = byReport.get(row.id) || [];
  }
  return result.rows;
}
async function save(kind, id, input) {
  const data = normalize(kind, input);
  const result = id
    ? await pool.query(`UPDATE ${table(kind)} SET data=$2, updated_at=NOW() WHERE id=$1 RETURNING id, data, created_at AS "createdAt", updated_at AS "updatedAt"`, [id, data])
    : await pool.query(`INSERT INTO ${table(kind)} (id,data) VALUES($1,$2) RETURNING id, data, created_at AS "createdAt", updated_at AS "updatedAt"`, [randomUUID(), data]);
  if (!result.rows.length) throw Object.assign(new Error('Data tidak ditemukan.'), { status: 404 });
  return result.rows[0];
}
async function remove(kind, id) {
  const result = await pool.query(`DELETE FROM ${table(kind)} WHERE id=$1`, [id]);
  if (!result.rowCount) throw Object.assign(new Error('Data tidak ditemukan.'), { status: 404 });
}
module.exports = { ensureStore, normalize, calendarDate, list, save, remove };
