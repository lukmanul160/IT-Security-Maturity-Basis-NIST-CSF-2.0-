const test = require('node:test');
const assert = require('node:assert/strict');
const { provisionAdmin } = require('../scripts/create-admin');
test('admin setup uses the chosen password, trims identity and always creates an admin', async () => {
  let saved;
  const user = await provisionAdmin({ username: ' nistadmin ', fullName: ' Operator ', password: 'ChosenPassword123', confirmPassword: 'ChosenPassword123', role: 'viewer' }, async data => { saved = data; return { username: data.username }; });
  assert.deepEqual(saved, { username: 'nistadmin', fullName: 'Operator', password: 'ChosenPassword123', role: 'admin' });
  assert.equal(user.username, 'nistadmin');
});
test('password confirmation fails before any database operation', async () => {
  await assert.rejects(provisionAdmin({ username: 'owner', fullName: '', password: 'First123', confirmPassword: 'Other123' }, async () => { throw new Error('Unexpected write'); }), /Konfirmasi/);
});
test('setup uses application password validation and stores a usable bcrypt hash', async t => {
  const { pool } = require('../src/config/database');
  let stored;
  t.mock.method(pool, 'query', async (sql, values) => { stored = values; return { rows: [{ id: 1, username: values[0], full_name: values[1], role: values[3] }] }; });
  await assert.rejects(provisionAdmin({ username: 'nistadmin', fullName: '', password: 'short', confirmPassword: 'short' }), /Password harus/);
  assert.equal(stored, undefined);
  const secret = 'ChosenPassword123';
  await provisionAdmin({ username: 'nistadmin', fullName: '', password: secret, confirmPassword: secret });
  assert.equal(stored[3], 'admin');
  assert.notEqual(stored[2], secret);
  assert.equal(await require('bcryptjs').compare(secret, stored[2]), true);
});
