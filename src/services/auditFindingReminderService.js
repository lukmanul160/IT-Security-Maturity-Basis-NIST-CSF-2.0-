const { localDate, scheduleSlot } = require('./reminderSchedule');
const { pool } = require('../config/database');
const smtp = require('./smtpService');
const templateDefaults = {
  subjectTemplate: 'Pengingat tindak lanjut audit: {{auditTitle}} - {{finding}}',
  bodyTemplate: 'Yth. Bapak/Ibu PIC dan tim terkait,\n\nMohon menindaklanjuti temuan audit berikut sebelum tanggal tenggat.\n\nJenis audit: {{auditTitle}}\nFinding: {{finding}}\nPIC penanggung jawab: {{owner}}\nStatus saat ini: {{status}}\nTenggat penyelesaian: {{dueDate}}\n\nDeskripsi temuan / rekomendasi:\n{{description}}\n\nLangkah yang perlu dilakukan:\n1. Tinjau temuan dan rekomendasi di atas.\n2. Lakukan tindak lanjut dan unggah evidence pendukung di Audit Finding Tracker.\n3. Perbarui status finding sesuai hasil tindak lanjut. Jika sudah selesai, ubah status menjadi Closed.\n\nJika ada kendala, koordinasikan dengan tim audit sebelum tenggat.\n\nTerima kasih atas perhatian dan kerja samanya.\n\nEmail ini merupakan pengingat otomatis dari Audit Finding Tracker.'
};
const defaults = { ...templateDefaults, enabled: false, daysBefore: 7, repeatDaily: false, startUnit: 'days', repeatEvery: 1, repeatUnit: 'days', maxDeliveries: 366, recipients: [] };
const invalid = message => Object.assign(new Error(message), { status: 400 });
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_finding_reminder_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings JSONB NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_finding_reminder_deliveries (
    finding_id UUID REFERENCES audit_finding_records(id) ON DELETE CASCADE,
    due_date DATE NOT NULL, recipient TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(finding_id,due_date,recipient))`);
  await pool.query(`ALTER TABLE audit_finding_reminder_deliveries ADD COLUMN IF NOT EXISTS reminder_date DATE;
    UPDATE audit_finding_reminder_deliveries SET reminder_date=sent_at::date WHERE reminder_date IS NULL;
    ALTER TABLE audit_finding_reminder_deliveries ALTER COLUMN reminder_date SET NOT NULL;
    ALTER TABLE audit_finding_reminder_deliveries DROP CONSTRAINT IF EXISTS audit_finding_reminder_deliveries_pkey;
    ALTER TABLE audit_finding_reminder_deliveries ADD PRIMARY KEY(finding_id,due_date,recipient,reminder_date)`);
}
async function read() {
  const result = await pool.query('SELECT settings FROM audit_finding_reminder_settings WHERE id=1');
  return { ...defaults, ...result.rows[0]?.settings };
}
async function getSettings() {
  return { ...await read(), templateExample: { ...templateDefaults }, smtpConfigured: (await smtp.getSettings()).configured };
}
function validate(data) {
  if (!data || typeof data.enabled !== 'boolean' || !Number.isInteger(data.daysBefore) || data.daysBefore < 0 || data.daysBefore > 365) throw invalid('Status dan jadwal reminder tidak valid (0–365 hari).');
  if (['host','port','security','username','password','from','clearPassword'].some(key => Object.hasOwn(data,key))) throw invalid('Koneksi SMTP diatur melalui Admin > Pengaturan SMTP.');
  if (!Array.isArray(data.recipients) || data.recipients.length > 100 || data.recipients.some(to => !smtp.email(to))) throw invalid('Daftar email penerima tidak valid (maksimum 100).');
  if (data.repeatDaily !== undefined && typeof data.repeatDaily !== 'boolean') throw invalid('Pilihan pengulangan reminder tidak valid.');
  const startUnit = data.startUnit ?? 'days';
  const repeatUnit = data.repeatUnit ?? 'days';
  const repeatEvery = data.repeatEvery ?? 1;
  if (!['days', 'months'].includes(startUnit) || !['days', 'months'].includes(repeatUnit)) throw invalid('Satuan reminder harus hari atau bulan.');
  if (startUnit === 'months' && data.daysBefore > 36) throw invalid('Waktu mulai maksimal 36 bulan.');
  if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > (repeatUnit === 'months' ? 36 : 365)) throw invalid('Interval reminder tidak valid.');
  const maxDeliveries = data.maxDeliveries === undefined ? defaults.maxDeliveries : data.maxDeliveries;
  if (!Number.isInteger(maxDeliveries) || maxDeliveries < 1 || maxDeliveries > 366) throw invalid('Jumlah pengiriman harus bilangan bulat antara 1 dan 366.');
  const recipients = [...new Set(data.recipients.map(to => to.trim().toLowerCase()))];
  if (data.enabled && !recipients.length) throw invalid('Isi penerima sebelum mengaktifkan reminder.');
  const templates = {};
  for (const [field, limit] of [['subjectTemplate', 200], ['bodyTemplate', 10000]]) {
    const value = data[field] === undefined ? templateDefaults[field] : data[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || (field === 'subjectTemplate' && /[\r\n]/.test(value))) throw invalid('Subjek atau isi email tidak valid.');
    if ([...value.matchAll(/{{([^{}]+)}}/g)].some(match => !['auditTitle','finding','owner','status','dueDate','description'].includes(match[1]))) throw invalid('Variabel email tidak dikenal. Gunakan auditTitle, finding, owner, status, dueDate, atau description.');
    templates[field] = value;
  }
  return { ...templates, enabled: data.enabled, daysBefore: data.daysBefore, repeatDaily: data.repeatDaily ?? false, startUnit, repeatEvery, repeatUnit, maxDeliveries, recipients };
}
async function saveSettings(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Pengaturan reminder tidak valid.');
  const current = await read();
  const settings = validate({ ...current, ...data });
  if (settings.enabled && !(await smtp.getSettings()).configured) throw invalid('Konfigurasikan SMTP di Admin > Pengaturan SMTP terlebih dahulu.');
  await pool.query('INSERT INTO audit_finding_reminder_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings', [settings]);
  return getSettings();
}
function renderMessage(row, settings = templateDefaults) {
  const values = { auditTitle: row.auditTitle, finding: row.data.title, owner: row.data.owner, status: row.data.status, dueDate: row.data.dueDate, description: row.data.description };
  const render = template => template.replace(/{{(\w+)}}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name] ?? '') : match);
  return {
    subject: render(settings.subjectTemplate || templateDefaults.subjectTemplate).replace(/[\r\n]/g, ' '),
    text: render(settings.bodyTemplate || templateDefaults.bodyTemplate)
  };
}
function reminderSlot(row, options, now = new Date()) {
  if (row.kind !== 'finding' || row.data?.status === 'Closed') return null;
  return scheduleSlot(row.data?.dueDate, options, now);
}
function eligible(row, daysBefore, now = new Date()) {
  return reminderSlot(row, { daysBefore }, now) !== null;
}
async function testEmail(to) {
  if (!smtp.email(to)) throw invalid('Email tujuan tes tidak valid.');
  const settings = await read();
  const { mailer, from } = await smtp.createMailer();
  try { await smtp.send(mailer, { from, to, ...renderMessage({ auditTitle: 'Audit Keamanan Informasi (contoh)', data: { title: 'Review akses belum selesai (contoh)', description: 'Lakukan review dan lampirkan evidence.', owner: 'PIC Audit', status: 'Open', dueDate: '2026-12-31' } }, settings) }); }
  finally { mailer.close?.(); }
  return { message: 'Email percobaan diterima server SMTP Admin.' };
}
async function runReminders(now = new Date()) {
  const client = await pool.connect();
  let mailer, locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(73421010) AS locked')).rows[0].locked;
    if (!locked) return;
    const settings = await read();
    if (!settings.enabled) return;
    const result = await client.query(`SELECT f.id, f.kind, f.data, a.data->>'title' AS "auditTitle" FROM audit_finding_records f JOIN audit_finding_records a ON a.id=f.parent_id AND a.kind='audit' WHERE f.kind='finding' AND f.data->>'status' <> 'Closed'`);
    const pending = result.rows.filter(row => reminderSlot(row, settings, now) !== null);
    if (!pending.length) return;
    const delivery = await smtp.createMailer(); mailer = delivery.mailer;
    for (const row of pending) for (const to of settings.recipients) {
      const params = [row.id, row.data.dueDate, to];
      const history = await client.query(`SELECT COUNT(*)::int AS count,
        COALESCE(BOOL_OR(reminder_date >= $4::date), false) AS sent_in_slot
        FROM audit_finding_reminder_deliveries WHERE finding_id=$1 AND due_date=$2 AND recipient=$3`, [...params, reminderSlot(row, settings, now)]);
      const limit = settings.repeatDaily ? settings.maxDeliveries : 1;
      if (history.rows[0].sent_in_slot || history.rows[0].count >= limit) continue;
      try {
        await smtp.send(mailer, { from: delivery.from, to, ...renderMessage(row, settings) });
        await client.query('INSERT INTO audit_finding_reminder_deliveries(finding_id,due_date,recipient,reminder_date) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [...params, localDate(now)]);
      } catch { console.error('[audit-finding-reminder] Delivery failed for finding', row.id); }
    }
  } finally {
    mailer?.close?.();
    try { if (locked) await client.query('SELECT pg_advisory_unlock(73421010)'); } finally { client.release(); }
  }
}
function startScheduler() {
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await runReminders(); } catch { console.error('[audit-finding-reminder] Scheduler failed'); } finally { running = false; } };
  const timer = setInterval(tick, 60 * 60 * 1000); timer.unref(); void tick(); return timer;
}
module.exports = { templateDefaults, ensureStore, getSettings, saveSettings, validate, renderMessage, eligible, reminderSlot, testEmail, runReminders, startScheduler };
