const { pool } = require('../config/database');
const smtp = require('./smtpService');
const { validateSchedule } = require('./reminderSchedule');
const invalid = message => Object.assign(new Error(message), { status: 400 });
const templateDefaults = {
  subjectTemplate: 'Pengingat pelaporan: {{reportTitle}}',
  bodyTemplate: 'Yth. {{owner}},\n\nMohon menyiapkan pelaporan berikut:\nLaporan: {{reportTitle}}\nTujuan: {{recipient}}\nTenggat: {{dueDate}}\nStatus: {{status}}\n\n{{description}}\n\nSetelah dikirim, ubah status menjadi Sudah dilaporkan di Reporting Regulator.'
};
const defaults = { ...templateDefaults, enabled: false, smtpAccountId: 'default', daysBefore: 7, startUnit: 'days', repeatDaily: true, repeatEvery: 1, repeatUnit: 'days', maxDeliveries: 366, unlimited: true, continueOverdue: true, recipientMode: 'owners', owners: [], recipients: [] };
async function read(client = pool) {
  // Also support application entry points that mount routes without server.js.
  await client.query('CREATE TABLE IF NOT EXISTS compliance_reminder_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings JSONB NOT NULL)');
  const result = await client.query('SELECT settings FROM compliance_reminder_settings WHERE id=1');
  return { ...defaults, ...result.rows[0]?.settings };
}
function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Pengaturan reminder tidak valid.');
  const data = { ...defaults, ...input };
  for (const field of ['enabled', 'unlimited', 'continueOverdue']) if (typeof data[field] !== 'boolean') throw invalid('Pilihan reminder tidak valid.');
  const schedule = validateSchedule(data);
  if (data.continueOverdue && !data.repeatDaily) throw invalid('Reminder setelah tenggat memerlukan pengulangan aktif.');
  if (!['owners', 'broadcast'].includes(data.recipientMode)) throw invalid('Mode penerima tidak valid.');
  if (!Array.isArray(data.owners) || data.owners.length > 500 || !Array.isArray(data.recipients) || data.recipients.length > 100) throw invalid('Daftar penerima terlalu panjang.');
  const owners = data.owners.map(row => {
    if (typeof row?.owner !== 'string' || !row.owner.trim() || row.owner.trim().length > 160 || !smtp.email(row.email)) throw invalid('Pemetaan PIC dan email tidak valid.');
    return { owner: row.owner.trim(), email: row.email.trim().toLowerCase() };
  });
  if (new Set(owners.map(row => row.owner.toLowerCase())).size !== owners.length) throw invalid('Nama PIC tidak boleh duplikat.');
  if (data.recipients.some(email => !smtp.email(email))) throw invalid('Email penerima tidak valid.');
  const recipients = [...new Set(data.recipients.map(email => email.trim().toLowerCase()))];
  if (data.enabled && data.recipientMode === 'broadcast' && !recipients.length) throw invalid('Isi daftar penerima sebelum mengaktifkan reminder.');
  const templates = {};
  for (const [field, limit] of [['subjectTemplate', 200], ['bodyTemplate', 10000]]) {
    const value = data[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || (field === 'subjectTemplate' && /[\r\n]/.test(value))) throw invalid('Subjek / isi email tidak valid.');
    if ([...value.matchAll(/{{([^{}]+)}}/g)].some(match => !['reportTitle', 'recipient', 'owner', 'status', 'dueDate', 'description'].includes(match[1]))) throw invalid('Variabel email tidak dikenal.');
    templates[field] = value;
  }
  return { ...schedule, ...templates, enabled: data.enabled, smtpAccountId: smtp.accountId(data.smtpAccountId), unlimited: data.unlimited, continueOverdue: data.continueOverdue, recipientMode: data.recipientMode, owners, recipients };
}
async function getSettings() {
  const settings = await read();
  return { ...settings, templateExample: templateDefaults, smtpConfigured: (await smtp.getSettings(settings.smtpAccountId)).configured, smtpAccounts: await smtp.listAccounts() };
}
async function saveSettings(input) {
  const settings = validate({ ...await read(), ...input });
  const account = await smtp.getSettings(settings.smtpAccountId);
  if (settings.enabled && !account.configured) throw invalid('Konfigurasikan akun SMTP sebelum mengaktifkan reminder.');
  await pool.query('INSERT INTO compliance_reminder_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings', [settings]);
  return getSettings();
}
function renderMessage(data, settings) {
  const values = { reportTitle: data.title, recipient: data.recipient, owner: data.owner, status: data.status, dueDate: data.dueDate, description: data.notes };
  const render = template => template.replace(/{{(\w+)}}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match);
  return { subject: render(settings.subjectTemplate).replace(/[\r\n]/g, ' '), text: render(settings.bodyTemplate) };
}
function recipientsFor(data, settings, registered = new Map()) {
  if (settings.recipientMode === 'broadcast') return settings.recipients;
  if (smtp.email(data.reminderEmail)) return [data.reminderEmail.trim().toLowerCase()];
  const key = String(data.owner || '').trim().toLowerCase();
  if (registered.has(key)) return registered.get(key) ? [registered.get(key)] : [];
  const mapped = settings.owners.find(row => row.owner.toLowerCase() === key);
  return mapped ? [mapped.email] : [];
}
async function testEmail(to) {
  if (!smtp.email(to)) throw invalid('Email percobaan tidak valid.');
  const settings = await read(), delivery = await smtp.createMailer(settings.smtpAccountId);
  try {
    await smtp.send(delivery.mailer, { from: delivery.from, to, ...renderMessage({ title: 'Laporan contoh', recipient: 'Regulator contoh', owner: 'PIC Compliance', status: 'Belum dilaporkan', dueDate: '2026-12-31', notes: 'Siapkan laporan dan perbarui status setelah dikirim.' }, settings) });
    return { message: 'Email percobaan berhasil dikirim.' };
  } finally { delivery.mailer?.close?.(); }
}
module.exports = { defaults, templateDefaults, read, validate, getSettings, saveSettings, renderMessage, recipientsFor, testEmail };
