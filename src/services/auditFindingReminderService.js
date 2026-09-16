const { pool } = require('../config/database');
const smtp = require('./smtpService');
const defaults = { enabled: false, daysBefore: 7, recipients: [] };
const invalid = message => Object.assign(new Error(message), { status: 400 });
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_finding_reminder_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings JSONB NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_finding_reminder_deliveries (
    finding_id UUID REFERENCES audit_finding_records(id) ON DELETE CASCADE,
    due_date DATE NOT NULL, recipient TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(finding_id,due_date,recipient))`);
}
async function read() {
  const result = await pool.query('SELECT settings FROM audit_finding_reminder_settings WHERE id=1');
  return { ...defaults, ...result.rows[0]?.settings };
}
async function getSettings() {
  return { ...await read(), smtpConfigured: (await smtp.getSettings()).configured };
}
function validate(data) {
  if (!data || typeof data.enabled !== 'boolean' || !Number.isInteger(data.daysBefore) || data.daysBefore < 0 || data.daysBefore > 365) throw invalid('Status dan jadwal reminder tidak valid (0–365 hari).');
  if (['host','port','security','username','password','from','clearPassword'].some(key => Object.hasOwn(data,key))) throw invalid('Koneksi SMTP diatur melalui Admin > Pengaturan SMTP.');
  if (!Array.isArray(data.recipients) || data.recipients.length > 100 || data.recipients.some(to => !smtp.email(to))) throw invalid('Daftar email penerima tidak valid (maksimum 100).');
  const recipients = [...new Set(data.recipients.map(to => to.trim().toLowerCase()))];
  if (data.enabled && !recipients.length) throw invalid('Isi penerima sebelum mengaktifkan reminder.');
  return { enabled: data.enabled, daysBefore: data.daysBefore, recipients };
}
async function saveSettings(data) {
  const settings = validate(data);
  if (settings.enabled && !(await smtp.getSettings()).configured) throw invalid('Konfigurasikan SMTP di Admin > Pengaturan SMTP terlebih dahulu.');
  await pool.query('INSERT INTO audit_finding_reminder_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings', [settings]);
  return getSettings();
}
function renderMessage(row) {
  return {
    subject: `Reminder finding audit: ${row.auditTitle}`.replace(/[\r\n]/g, ' '),
    text: `Judul: ${row.auditTitle}\nFinding: ${row.data.title}\n\nDeskripsi finding: ${row.data.description || '-'}\nPIC: ${row.data.owner || '-'}\nStatus: ${row.data.status}\nTenggat: ${row.data.dueDate}\n\nMohon tindak lanjuti finding melalui Audit Finding Tracker.`
  };
}
function eligible(row, daysBefore, now = new Date()) {
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() + daysBefore);
  const date = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
  return row.data.status !== 'Closed' && /^\d{4}-\d{2}-\d{2}$/.test(row.data.dueDate || '') && row.data.dueDate <= date;
}
async function testEmail(to) {
  if (!smtp.email(to)) throw invalid('Email tujuan tes tidak valid.');
  const { mailer, from } = await smtp.createMailer();
  try { await smtp.send(mailer, { from, to, ...renderMessage({ auditTitle: 'Audit Keamanan Informasi (contoh)', data: { title: 'Review akses belum selesai (contoh)', description: 'Lakukan review dan lampirkan evidence.', owner: 'PIC Audit', status: 'Open', dueDate: '2026-12-31' } }) }); }
  finally { mailer.close?.(); }
  return { message: 'Email percobaan diterima server SMTP Admin.' };
}
async function runReminders() {
  const client = await pool.connect();
  let mailer, locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(73421010) AS locked')).rows[0].locked;
    if (!locked) return;
    const settings = await read();
    if (!settings.enabled) return;
    const result = await client.query(`SELECT f.id, f.data, a.data->>'title' AS "auditTitle" FROM audit_finding_records f JOIN audit_finding_records a ON a.id=f.parent_id AND a.kind='audit' WHERE f.kind='finding' AND f.data->>'status' <> 'Closed'`);
    const pending = result.rows.filter(row => eligible(row, settings.daysBefore));
    if (!pending.length) return;
    const delivery = await smtp.createMailer(); mailer = delivery.mailer;
    for (const row of pending) for (const to of settings.recipients) {
      const params = [row.id, row.data.dueDate, to];
      if ((await client.query('SELECT 1 FROM audit_finding_reminder_deliveries WHERE finding_id=$1 AND due_date=$2 AND recipient=$3', params)).rowCount) continue;
      try {
        await smtp.send(mailer, { from: delivery.from, to, ...renderMessage(row) });
        await client.query('INSERT INTO audit_finding_reminder_deliveries(finding_id,due_date,recipient) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', params);
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
module.exports = { ensureStore, getSettings, saveSettings, validate, renderMessage, eligible, testEmail, runReminders, startScheduler };
