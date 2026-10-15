const settingsService = require('./complianceReminderSettingsService');
const smtp = require('./smtpService');
function describe(data, settings, accounts, registered = new Map(), now = new Date()) {
  const shared = data.useGlobalReminder === true;
  const options = shared ? settings : { enabled: data.reminderEnabled, smtpAccountId: data.smtpAccountId, daysBefore: data.daysBefore, startUnit: 'days', repeatDaily: data.repeatDaily, repeatEvery: 1, repeatUnit: 'days', continueOverdue: data.continueOverdue, unlimited: true };
  const account = accounts.find(row => row.id === options.smtpAccountId);
  const recipients = shared ? settingsService.recipientsFor(data, settings, registered) : smtp.email(data.reminderEmail) ? [data.reminderEmail] : [];
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const state = data.status === 'Sudah dilaporkan' ? 'Selesai — reminder berhenti'
    : !options.enabled ? shared ? 'Nonaktif di tab SMTP' : 'Reminder nonaktif'
    : data.dueDate < today && !options.continueOverdue ? 'Berakhir — lewat tenggat'
    : !account?.configured ? 'Akun SMTP belum siap'
    : !recipients.length ? 'Email PIC belum dipetakan'
    : 'Reminder aktif';
  return { mode: shared ? 'global' : 'local', state, enabled: Boolean(options.enabled), smtpAccountId: options.smtpAccountId, smtpAccountName: account?.name || 'Akun tidak tersedia', smtpConfigured: Boolean(account?.configured), recipients, daysBefore: options.daysBefore, startUnit: options.startUnit, repeatDaily: Boolean(options.repeatDaily), repeatEvery: options.repeatEvery, repeatUnit: options.repeatUnit, continueOverdue: Boolean(options.continueOverdue), unlimited: Boolean(options.unlimited), maxDeliveries: options.maxDeliveries };
}
async function context() {
  const [settings, accounts] = await Promise.all([settingsService.read(), smtp.listAccounts()]);
  return { settings, accounts };
}
async function enrich(records) {
  if (!records.length) return records;
  const { settings, accounts } = await context();
  const registered = records.some(row => row.data.useGlobalReminder) && settings.recipientMode === 'owners'
    ? await require('./reminderRecipientService').emailMap() : new Map();
  return records.map(row => ({ ...row, reminder: describe(row.data, settings, accounts, registered) }));
}
async function publicContext() {
  const { settings, accounts } = await context();
  // Expose only the shared connection/schedule summary, not templates or credentials.
  const summary = describe({ useGlobalReminder: true, status: 'Belum dilaporkan' }, settings, accounts);
  delete summary.recipients;
  return { ...summary, recipientMode: settings.recipientMode };
}
module.exports = { describe, enrich, publicContext };
