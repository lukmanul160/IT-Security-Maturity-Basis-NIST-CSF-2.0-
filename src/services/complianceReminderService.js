const { pool } = require('../config/database');
const smtp = require('./smtpService');
const { scheduleSlot } = require('./reminderSchedule');
const globalSettings = require('./complianceReminderSettingsService');

// Reporting deadlines use the company's UTC+7 calendar, independent of host TZ.
function businessDate(now) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function reminderSlot(data, now = new Date()) {
  if (!data.reminderEnabled || data.status === 'Sudah dilaporkan' || !smtp.email(data.reminderEmail)) return null;
  const today = businessDate(now);
  // scheduleSlot consumes local date fields; construct a local noon for that date.
  const calendar = new Date(`${today}T12:00:00`);
  const continuous = data.continueOverdue === true && data.repeatDaily === true;
  // A daily schedule needs today's date once its start is reached. Avoid walking
  // every elapsed day when a continuous reminder has been active for years.
  const start = scheduleSlot(data.dueDate, { daysBefore: data.daysBefore, repeatDaily: false, continueOverdue: continuous }, calendar);
  return start === null ? null : data.repeatDaily ? today : start;
}
function renderMessage(data) {
  return {
    subject: `Pengingat pelaporan: ${data.title.replace(/[\r\n]/g, ' ')}`,
    text: `Yth. ${data.owner},\n\nMohon menyiapkan pelaporan berikut:\n\nLaporan: ${data.title}\nTujuan: ${data.recipient} (${data.recipientType})\nTenggat: ${data.dueDate}\nStatus: ${data.status}\n\n${data.notes || ''}\n\nSetelah dikirim, ubah status menjadi Sudah dilaporkan di Compliance > Reporting Regulator.`
  };
}
async function runReminders(now = new Date()) {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(73421018) AS locked')).rows[0].locked;
    if (!locked) return;
    const settings = await globalSettings.read(client);
    const result = await client.query("SELECT id,data FROM compliance_reports WHERE (data->>'reminderEnabled'='true' OR data->>'useGlobalReminder'='true') AND data->>'status'<>'Sudah dilaporkan'");
    const registered = settings.enabled && settings.recipientMode === 'owners' && result.rows.some(row => row.data.useGlobalReminder)
      ? await require('./reminderRecipientService').emailMap(client) : new Map();
    for (const row of result.rows) {
      const shared = row.data.useGlobalReminder === true;
      if (shared && !settings.enabled) continue;
      const slot = shared
        ? scheduleSlot(row.data.dueDate, settings, new Date(`${businessDate(now)}T12:00:00`))
        : reminderSlot(row.data, now);
      if (!slot) continue;
      const recipients = shared ? globalSettings.recipientsFor(row.data, settings, registered) : [row.data.reminderEmail];
      for (const to of recipients) {
        const params = [row.id, row.data.dueDate, to];
        const history = await client.query(`SELECT COUNT(*)::int AS count, COALESCE(BOOL_OR(reminder_date >= $4::date),false) AS sent
          FROM compliance_reminder_deliveries WHERE report_id=$1 AND due_date=$2 AND recipient=$3`, [...params, slot]);
        const limit = shared ? !settings.repeatDaily ? 1 : settings.unlimited ? Infinity : settings.maxDeliveries : Infinity;
        if (history.rows[0].sent || history.rows[0].count >= limit) continue;
        let delivery;
        try {
          // Recheck status/date after reading history in case a user edited the report.
          const current = await client.query('SELECT data FROM compliance_reports WHERE id=$1', [row.id]);
          if (!current.rows.length || JSON.stringify(current.rows[0].data) !== JSON.stringify(row.data)) continue;
          delivery = await smtp.createMailer(shared ? settings.smtpAccountId : row.data.smtpAccountId);
          await smtp.send(delivery.mailer, { from: delivery.from, to, ...(shared ? globalSettings.renderMessage(row.data, settings) : renderMessage(row.data)) });
          await client.query(`INSERT INTO compliance_reminder_deliveries(report_id,due_date,recipient,reminder_date)
            VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [...params, businessDate(now)]);
        } catch {
          console.error('[compliance-reminder] Delivery failed for report', row.id);
        } finally { delivery?.mailer?.close?.(); }
      }
    }
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(73421018)'); }
    finally { client.release(); }
  }
}
function startScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runReminders(); }
    catch { console.error('[compliance-reminder] Scheduler failed'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  void tick();
  return timer;
}
module.exports = { businessDate, reminderSlot, renderMessage, runReminders, startScheduler };
