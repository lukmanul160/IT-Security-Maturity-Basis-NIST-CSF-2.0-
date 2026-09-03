const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/config/database');
const originalQuery = pool.query.bind(pool);

function restore() {
  pool.query = originalQuery;
  delete require.cache[require.resolve('../src/services/policyRegisterService')];
}

test('policy register service supports CRUD and attachment metadata', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS policy_register')) {
      return { rows: [] };
    }
    if (typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS policy_register_dropdown_options')) {
      return { rows: [] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT COUNT(*)::int AS count FROM policy_register_dropdown_options')) {
      return { rows: [{ count: 0 }] };
    }
    if (typeof sql === 'string' && sql.includes('INSERT INTO policy_register_dropdown_options')) {
      return { rows: [], rowCount: 1 };
    }
    if (typeof sql === 'string' && sql.includes('SELECT id, title')) {
      return { rows: [{ id: 1, title: 'Information Security Policy', category: 'Cybersecurity', owner: 'CISO', review_cycle: 'Annual', approval_status: 'Approved', last_review: '2026-08-15', attachment_name: 'security-policy.pdf', attachment_path: 'uploads/policy/security-policy.pdf', attachment_type: 'application/pdf', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] };
    }
    if (typeof sql === 'string' && sql.includes('INSERT INTO policy_register')) {
      return { rows: [{ id: 1, title: params[0], category: params[1], owner: params[2], review_cycle: params[3], approval_status: params[4], last_review: params[5], attachment_name: params[6], attachment_path: params[7], attachment_type: params[8] }] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT * FROM policy_register WHERE id = $1')) {
      return { rowCount: 1, rows: [{ id: 1, title: 'Information Security Policy', category: 'Cybersecurity', owner: 'CISO', review_cycle: 'Annual', approval_status: 'Approved', last_review: '2026-08-15', attachment_name: 'security-policy.pdf', attachment_path: 'uploads/policy/security-policy.pdf', attachment_type: 'application/pdf', notes: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] };
    }
    if (typeof sql === 'string' && sql.includes('UPDATE policy_register')) {
      return { rowCount: 1, rows: [{ id: 1, title: params[0], category: params[1], owner: params[2], review_cycle: params[3], approval_status: params[4], last_review: params[5], attachment_name: params[6], attachment_path: params[7], attachment_type: params[8], notes: params[9] }] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT attachment_path FROM policy_register WHERE id = $1')) {
      return { rowCount: 1, rows: [{ attachment_path: 'uploads/policy/security-policy.pdf' }] };
    }
    if (typeof sql === 'string' && sql.includes('DELETE FROM policy_register')) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const service = require('../src/services/policyRegisterService');

  await assert.doesNotReject(() => service.ensureStore());
  const list = await service.list();
  assert.equal(Array.isArray(list), true);
  const created = await service.create({
    title: 'Information Security Policy',
    category: 'Cybersecurity',
    owner: 'CISO',
    reviewCycle: 'Annual',
    approvalStatus: 'Approved',
    lastReview: '2026-08-15',
    attachmentName: 'security-policy.pdf',
    attachmentPath: 'uploads/policy/security-policy.pdf',
    attachmentType: 'application/pdf',
    items: [
      { subtitle: 'Purpose', content: 'Defines the security policy purpose.' },
      { subtitle: 'Scope', content: 'Applies to all information assets.' },
    ]
  });
  assert.equal(created.title, 'Information Security Policy');
  assert.deepEqual(created.items, [
    { subtitle: 'Purpose', content: 'Defines the security policy purpose.' },
    { subtitle: 'Scope', content: 'Applies to all information assets.' },
  ]);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO policy_register_items')).length, 2);

  const updated = await service.update(1, { title: 'Updated Policy', approvalStatus: 'Review due' });
  assert.equal(updated.title, 'Updated Policy');

  await assert.doesNotReject(() => service.remove(1));
  assert.ok(calls.length >= 4);
  restore();
});

process.on('exit', restore);
