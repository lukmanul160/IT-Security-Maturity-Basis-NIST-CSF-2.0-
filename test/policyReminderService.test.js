const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextReview, validate } = require('../src/services/policyReminderService');
test('review dates clamp month ends and handle leap years', () => {
  assert.equal(nextReview({ last_review: '2024-02-29', review_cycle: 'Annual' }), '2025-02-28');
  assert.equal(nextReview({ last_review: '2026-08-31', review_cycle: 'Biannual' }), '2027-02-28');
  assert.equal(nextReview({ last_review: '2026-01-31', review_cycle: 'Quarterly' }), '2026-04-30');
});
test('unscheduled and missing dates are skipped', () => {
  for (const review_cycle of ['Ad hoc', 'Custom', '']) assert.equal(nextReview({ last_review: '2026-01-01', review_cycle }), null);
  assert.equal(nextReview({ review_cycle: 'Annual' }), null);
});
const settings = { enabled: true, daysBefore: 30, owners: [{ owner: 'CISO', email: 'owner@example.com' }] };
test('scheduler skips unassigned policies, records success, deduplicates, and retries failures', async t => {
  const { pool } = require('../src/config/database');
  const smtp = require('../src/services/smtpService');
  const { runReminders } = require('../src/services/policyReminderService');
  let sent = 0;
  let fail = true;
  const deliveries = new Set();
  t.mock.method(smtp, 'createMailer', async () => ({ from:'sender@example.com', mailer:{ sendMail: async () => {
    sent++;
    if (fail) throw new Error('SMTP unavailable');
    return { accepted: ['owner@example.com'], rejected: [] };
  } } }));
  t.mock.method(pool, 'query', async () => ({ rows: [{ settings, secret: '' }] }));
  t.mock.method(pool, 'connect', async () => ({ release() {}, query: async (sql, params) => {
    if (sql.includes('pg_try')) return { rows: [{ locked: true }] };
    if (sql.includes('FROM policy_register')) return { rows: [
      { id: 1, title: 'Due', owner: 'CISO', last_review: '2020-01-01', review_cycle: 'Annual' },
      { id: 2, owner: 'Other', last_review: '2020-01-01', review_cycle: 'Annual' },
      { id: 3, owner: 'CISO', last_review: '2099-01-01', review_cycle: 'Annual' }
    ] };
    if (sql.startsWith('SELECT 1')) return { rowCount: deliveries.has(params.join('|')) ? 1 : 0 };
    if (sql.startsWith('INSERT')) deliveries.add(params.join('|'));
    return { rows: [] };
  } }));
  await runReminders();
  assert.equal(deliveries.size, 0);
  fail = false;
  await runReminders();
  await runReminders();
  assert.equal(sent, 2);
  assert.equal(deliveries.size, 1);
});
test('reminder settings validate recipients and schedule independently of SMTP', () => {
  assert.deepEqual(validate(settings), { ...settings, ...require('../src/services/policyReminderService').templateDefaults });
  for (const changes of [{ daysBefore: -1 }, { owners: [] }, { owners: [{ owner: 'CISO', email: 'bad' }] }, { owners: [...settings.owners, ...settings.owners] }]) assert.throws(() => validate({ ...settings, ...changes }), { status: 400 });
});

test('custom email content renders placeholders without recursive replacement', () => {
  const { renderMessage } = require('../src/services/policyReminderService');
  assert.deepEqual(renderMessage({ subjectTemplate: 'Review {{title}}', bodyTemplate: 'Halo {{owner}}\nBatas {{dueDate}}' }, { title: 'Policy', owner: '{{title}}' }, '2027-01-15'), { subject: 'Review Policy', text: 'Halo {{title}}\nBatas 2027-01-15' });
  assert.throws(() => validate({ ...settings, subjectTemplate: 'Bad\nHeader' }), { status: 400 });
  assert.throws(() => validate({ ...settings, bodyTemplate: '{{unknown}}' }), { status: 400 });
  assert.throws(() => validate({ ...settings, bodyTemplate: ' ' }), { status: 400 });
});
