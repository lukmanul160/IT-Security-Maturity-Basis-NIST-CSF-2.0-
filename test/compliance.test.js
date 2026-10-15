const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = require('../src/services/complianceService');
const reminder = require('../src/services/complianceReminderService');
const smtp = require('../src/services/smtpService');
const globalSettings = require('../src/services/complianceReminderSettingsService');
const { pool } = require('../src/config/database');
const report = () => ({ title: 'Laporan berkala', recipient: 'Instansi tujuan', recipientType: 'Regulator', owner: 'Tim compliance', dueDate: '2026-10-20', reminderEnabled: true, reminderEmail: 'pic@example.com', daysBefore: 7 });

test('compliance validates reports, real calendar dates, reminders, and contact data', () => {
  assert.equal(service.normalize('reports', report()).status, 'Belum dilaporkan');
  for (const change of [{ title: '' }, { recipientType: 'Other' }, { dueDate: '2026-02-30' }, { reminderEmail: '' }, { daysBefore: -1 }, { daysBefore: 1.5 }, { repeatDaily: 'true' }, { status: 'Invalid' }]) {
    assert.throws(() => service.normalize('reports', { ...report(), ...change }), { status: 400 });
  }
  assert.equal(service.normalize('contacts', { name: 'Damkar setempat', phone: '+62 21 555 0100' }).phone, '+62 21 555 0100');
  assert.throws(() => service.normalize('contacts', { name: 'Damkar', phone: 'javascript:alert(1)' }), { status: 400 });
  assert.throws(() => service.normalize('contacts', { name: '', phone: '123' }), { status: 400 });
  assert.throws(() => service.normalize('contacts', { name: 'Kontak', phone: '123', email: 'bad' }), { status: 400 });
});
test('reminder uses UTC+7, stops at deadline/completion, and distinguishes once from daily', () => {
  const data = service.normalize('reports', report());
  assert.equal(reminder.businessDate(new Date('2026-10-12T17:01:00Z')), '2026-10-13');
  assert.equal(reminder.reminderSlot(data, new Date('2026-10-12T16:59:00Z')), null);
  assert.equal(reminder.reminderSlot(data, new Date('2026-10-15T08:00:00Z')), '2026-10-13');
  assert.equal(reminder.reminderSlot({ ...data, repeatDaily: true }, new Date('2026-10-15T08:00:00Z')), '2026-10-15');
  assert.equal(reminder.reminderSlot(data, new Date('2026-10-20T17:00:00Z')), null);
  assert.equal(reminder.reminderSlot({ ...data, status: 'Sudah dilaporkan' }, new Date('2026-10-15T08:00:00Z')), null);
  assert.equal(reminder.reminderSlot({ ...data, reminderEnabled: false }, new Date('2026-10-15T08:00:00Z')), null);
});
test('continuous reminders continue after deadline without a delivery count limit until stopped', () => {
  const data = service.normalize('reports', { ...report(), repeatDaily: true, continueOverdue: true });
  assert.equal(reminder.reminderSlot(data, new Date('2026-10-20T17:00:00Z')), '2026-10-21');
  assert.equal(reminder.reminderSlot(data, new Date('2028-10-20T17:00:00Z')), '2028-10-21');
  assert.equal(reminder.reminderSlot({ ...data, status: 'Sudah dilaporkan' }, new Date('2028-10-21T08:00:00Z')), null);
  assert.equal(reminder.reminderSlot({ ...data, reminderEnabled: false }, new Date('2028-10-21T08:00:00Z')), null);
  assert.throws(() => service.normalize('reports', { ...report(), continueOverdue: true, repeatDaily: false }), { status: 400 });
  assert.throws(() => service.normalize('reports', { ...report(), continueOverdue: 'true' }), { status: 400 });
});
test('global reminder settings support monthly schedules, templates and recipient modes', () => {
  const settings = globalSettings.validate({ ...globalSettings.defaults, startUnit: 'months', daysBefore: 3, repeatUnit: 'months', repeatEvery: 1, owners: [{ owner: 'PIC', email: 'pic@example.com' }] });
  assert.equal(settings.repeatUnit, 'months');
  assert.deepEqual(globalSettings.recipientsFor({ owner: 'pic', reminderEmail: '' }, settings), ['pic@example.com']);
  assert.deepEqual(globalSettings.recipientsFor({ owner: 'PIC', reminderEmail: 'direct@example.com' }, settings), ['direct@example.com']);
  assert.deepEqual(globalSettings.recipientsFor({ owner: 'PIC' }, { ...settings, recipientMode: 'broadcast', recipients: ['team@example.com'] }), ['team@example.com']);
  assert.match(globalSettings.renderMessage({ ...report(), notes: 'Prepare' }, settings).text, /Prepare/);
  for (const change of [{ repeatEvery: 0 }, { daysBefore: 37 }, { owners: [{ owner: 'PIC', email: 'bad' }] }, { subjectTemplate: '{{unknown}}' }, { repeatDaily: false, continueOverdue: true }]) assert.throws(() => globalSettings.validate({ ...settings, ...change }), { status: 400 });
});
test('PostgreSQL compliance CRUD, reminder deduplication, retries and cascade cleanup', async () => {
  const client = await pool.connect();
  const query = pool.query, connect = pool.connect, createMailer = smtp.createMailer, send = smtp.send, getSmtp = smtp.getSettings, listSmtp = smtp.listAccounts;
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync('database/compliance.sql', 'utf8').replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE'));
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    let delivered = 0, fail = false;
    smtp.createMailer = async () => ({ from: 'sender@example.com', mailer: { close() {} } });
    smtp.send = async () => { if (fail) throw Error('SMTP unavailable'); delivered++; };
    const saved = await service.save('reports', null, report());
    assert.equal((await service.list('reports')).length, 1);
    await reminder.runReminders(new Date('2026-10-15T08:00:00Z'));
    await reminder.runReminders(new Date('2026-10-15T09:00:00Z'));
    assert.equal(delivered, 1);
    await service.save('reports', saved.id, { ...saved.data, dueDate: '2026-10-21' });
    fail = true;
    await reminder.runReminders(new Date('2026-10-15T08:00:00Z'));
    assert.equal((await client.query('SELECT * FROM compliance_reminder_deliveries')).rows.length, 1);
    fail = false;
    await reminder.runReminders(new Date('2026-10-15T08:00:00Z'));
    assert.equal(delivered, 2);
    await service.save('reports', saved.id, { ...saved.data, status: 'Sudah dilaporkan', repeatDaily: true });
    await reminder.runReminders(new Date('2026-10-16T08:00:00Z'));
    assert.equal(delivered, 2);
    await service.save('reports', saved.id, { ...saved.data, repeatDaily: true, continueOverdue: true });
    await reminder.runReminders(new Date('2026-10-22T08:00:00Z'));
    await reminder.runReminders(new Date('2026-10-22T09:00:00Z'));
    assert.equal(delivered, 3);
    await reminder.runReminders(new Date('2026-10-23T08:00:00Z'));
    assert.equal(delivered, 4);
    await service.save('reports', saved.id, { ...saved.data, repeatDaily: true, continueOverdue: true, reminderEnabled: false });
    await reminder.runReminders(new Date('2026-10-24T08:00:00Z'));
    assert.equal(delivered, 4);
    const configured = globalSettings.validate({ ...globalSettings.defaults, enabled: true, recipientMode: 'broadcast', recipients: ['team@example.com'], repeatEvery: 2, unlimited: false, maxDeliveries: 2 });
    await client.query('INSERT INTO compliance_reminder_settings(id,settings) VALUES(1,$1)', [configured]);
    const shared = await service.save('reports', null, { ...report(), reminderEmail: '', useGlobalReminder: true });
    await reminder.runReminders(new Date('2026-10-22T08:00:00Z'));
    await reminder.runReminders(new Date('2026-10-22T09:00:00Z'));
    assert.equal(delivered, 5);
    await reminder.runReminders(new Date('2026-10-23T08:00:00Z'));
    await reminder.runReminders(new Date('2026-10-25T08:00:00Z'));
    assert.equal(delivered, 6, 'maximum delivery limit stops subsequent intervals');
    await client.query('UPDATE compliance_reminder_settings SET settings=$1', [{ ...configured, unlimited: true }]);
    await reminder.runReminders(new Date('2026-10-27T08:00:00Z'));
    assert.equal(delivered, 7, 'unlimited resumes on subsequent interval');
    await service.save('reports', shared.id, { ...shared.data, status: 'Sudah dilaporkan' });
    await reminder.runReminders(new Date('2026-10-29T08:00:00Z'));
    assert.equal(delivered, 7);
    await service.remove('reports', shared.id);
    smtp.getSettings = async () => ({ configured: true });
    smtp.listAccounts = async () => [{ id: 'default', name: 'Test SMTP', configured: true }];
    const savedSettings = await globalSettings.saveSettings({ ...configured, enabled: false, subjectTemplate: 'Report {{reportTitle}}' });
    assert.equal(savedSettings.subjectTemplate, 'Report {{reportTitle}}');
    assert.equal((await globalSettings.read()).repeatEvery, 2);
    smtp.getSettings = async () => ({ configured: false });
    await assert.rejects(globalSettings.saveSettings({ enabled: true }), { status: 400 });
    const contact = await service.save('contacts', null, { name: 'Layanan internal', phone: '1234' });
    await service.save('contacts', contact.id, { ...contact.data, phone: '5678' });
    assert.equal((await service.list('contacts'))[0].data.phone, '5678');
    await service.remove('contacts', contact.id);
    await service.remove('reports', saved.id);
    assert.equal((await client.query('SELECT * FROM compliance_reminder_deliveries')).rows.length, 0);
    await assert.rejects(service.remove('reports', saved.id), { status: 404 });
  } finally {
    pool.query = query; pool.connect = connect; smtp.createMailer = createMailer; smtp.send = send; smtp.getSettings = getSmtp; smtp.listAccounts = listSmtp;
    await client.query('ROLLBACK'); client.release();
  }
});
test.after(() => pool.end());
