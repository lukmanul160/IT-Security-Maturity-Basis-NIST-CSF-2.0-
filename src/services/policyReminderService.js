const { pool } = require('../config/database');
const smtp = require('./smtpService');
const templateDefaults = {
  subjectTemplate: 'Pengingat review kebijakan: {{title}}',
  bodyTemplate: 'Kepada {{owner}},\n\nMohon lakukan review kebijakan berikut:\n{{title}}\nLast review: {{lastReview}}\nReview cycle: {{reviewCycle}}\nJatuh tempo review: {{dueDate}}\n\nSetelah review selesai, perbarui Last review pada Policy Register.',
};
function renderMessage(settings, policy, dueDate) {
  const values = { title: policy.title, owner: policy.owner, lastReview: policy.last_review, reviewCycle: policy.review_cycle, dueDate };
  const render = value => value.replace(/{{(\w+)}}/g, (match, name) => String(values[name] ?? match));
  return { subject: render(settings.subjectTemplate || templateDefaults.subjectTemplate).replace(/[\r\n]/g, ' '), text: render(settings.bodyTemplate || templateDefaults.bodyTemplate) };
}
const defaults = { ...templateDefaults, enabled: false, daysBefore: 30, owners: [] };
const invalid = message => Object.assign(new Error(message), { status: 400 });
const email = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS policy_reminder_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings JSONB NOT NULL, secret TEXT NOT NULL DEFAULT '')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS policy_reminder_deliveries (policy_id BIGINT REFERENCES policy_register(id) ON DELETE CASCADE, due_date DATE NOT NULL, recipient TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(policy_id, due_date, recipient))`);
  await smtp.ensureStore();
}
async function read() {
  const result = await pool.query('SELECT settings FROM policy_reminder_settings WHERE id = 1');
  return { settings: Object.fromEntries(Object.keys(defaults).map(field => [field, result.rows[0]?.settings?.[field] ?? defaults[field]])) };
}
async function getSettings() {
  const { settings } = await read();
  return { ...settings, smtpConfigured: (await smtp.getSettings()).configured };
}
function validate(data) {
  if (!data || typeof data.enabled !== 'boolean') throw invalid('Status reminder tidak valid.');
  const settings = {};
  if (!Number.isInteger(data.daysBefore) || data.daysBefore < 0 || data.daysBefore > 365) throw invalid('daysBefore tidak valid.');
  settings.daysBefore = data.daysBefore;
  if (!Array.isArray(data.owners) || data.owners.length > 500) throw invalid('Daftar penerima tidak valid.');
  settings.owners = data.owners.map(row => {
    if (typeof row?.owner !== 'string' || !row.owner.trim() || !email(row.email)) throw invalid('Setiap owner harus memiliki alamat email yang valid.');
    return { owner: row.owner.trim(), email: row.email.trim() };
  });
  if (new Set(settings.owners.map(row => row.owner)).size !== settings.owners.length) throw invalid('Owner tidak boleh duplikat.');
  if (data.enabled && !settings.owners.length) throw invalid('Penerima wajib diisi sebelum mengaktifkan reminder.');
  for (const [field, limit] of [['subjectTemplate', 200], ['bodyTemplate', 10000]]) {
    const value = data[field] === undefined ? templateDefaults[field] : data[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || (field === 'subjectTemplate' && /[\r\n]/.test(value))) throw invalid('Subjek atau isi email tidak valid.');
    const unknown = [...value.matchAll(/{{([^{}]+)}}/g)].some(match => !['title', 'owner', 'lastReview', 'reviewCycle', 'dueDate'].includes(match[1]));
    if (unknown) throw invalid('Variabel email tidak dikenal. Gunakan title, owner, lastReview, reviewCycle, atau dueDate.');
    settings[field] = value;
  }
  return { ...settings, enabled: data.enabled };
}
async function saveSettings(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Pengaturan reminder tidak valid.');
  if (['host','port','security','username','password','clearPassword','from'].some(field => Object.hasOwn(data,field))) throw invalid('Simpan koneksi email melalui Pengaturan SMTP terpusat.');
  const current = await read();
  const settings = validate({ ...current.settings, ...data });
  if (settings.enabled && !(await smtp.getSettings()).configured) throw invalid('Konfigurasikan SMTP terlebih dahulu melalui Account > Pengaturan SMTP.');
  await pool.query(`INSERT INTO policy_reminder_settings (id, settings, secret) VALUES (1, $1, '') ON CONFLICT(id) DO UPDATE SET settings = EXCLUDED.settings`, [settings]);
  return getSettings();
}
async function testEmail(to) {
  if (!email(to)) throw invalid('Email tujuan tes tidak valid.');
  const { settings } = await read();
  const {mailer,from} = await smtp.createMailer();
  try { await smtp.send(mailer, { from, to, ...renderMessage(settings, { title: 'Kebijakan Keamanan Informasi (contoh)', owner: 'CISO', last_review: '2026-01-15', review_cycle: 'Annual' }, '2027-01-15') }); }
  finally { mailer.close?.(); }
  return { message: 'Email tes diterima oleh server SMTP.' };
}
function nextReview(row) {
  const months = { annual: 12, biannual: 6, quarterly: 3 }[String(row.review_cycle).trim().toLowerCase()];
  if (!row.last_review || !months) return null;
  const date = new Date(`${String(row.last_review).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, end));
  return date.toISOString().slice(0, 10);
}
async function runReminders() {
  const client = await pool.connect();
  let mailer;
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(73421009) AS locked');
    if (!lock.rows[0].locked) return;
    const { settings } = await read();
    if (!settings.enabled) return;
    const delivery = await smtp.createMailer();
    mailer = delivery.mailer;
    const policies = await client.query('SELECT id, title, owner, review_cycle, last_review::text FROM policy_register');
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() + settings.daysBefore);
    for (const policy of policies.rows) {
      const due = nextReview(policy);
      const to = settings.owners.find(row => row.owner === policy.owner)?.email;
      if (!due || !to || due > cutoff.toISOString().slice(0, 10)) continue;
      const previous = await client.query('SELECT 1 FROM policy_reminder_deliveries WHERE policy_id = $1 AND due_date = $2 AND recipient = $3', [policy.id, due, to]);
      if (previous.rowCount) continue;
      try {
        await smtp.send(mailer, { from: delivery.from, to, ...renderMessage(settings, policy, due) });
        await client.query('INSERT INTO policy_reminder_deliveries (policy_id, due_date, recipient) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [policy.id, due, to]);
      } catch { console.error('[policy-reminder] Delivery failed for policy', policy.id); }
    }
  } finally {
    mailer?.close?.();
    try { await client.query('SELECT pg_advisory_unlock(73421009)'); } finally { client.release(); }
  }
}
function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runReminders(); } catch { console.error('[policy-reminder] Scheduler failed'); } finally { running = false; }
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  void tick();
  return timer;
}
module.exports = { renderMessage, templateDefaults, ensureStore, getSettings, saveSettings, testEmail, nextReview, validate, runReminders, startScheduler };
