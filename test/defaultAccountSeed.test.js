const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

test('initial account seed has usable passwords and preserves existing accounts in production', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../database/users.sql'), 'utf8');
  for (const [username, password, role] of [
    ['admin', 'AdminInitial123!', 'admin'],
    ['user', 'UserInitial123!', 'user'],
  ]) {
    const match = sql.match(new RegExp("\\('" + username + "', '([^']+)', '" + role + "'\\)"));
    assert.ok(match, `Missing ${username} seed`);
    assert.equal(await bcrypt.compare(password, match[1]), true);
  }
  assert.match(sql, /ON CONFLICT \(username\) DO NOTHING/);
  assert.doesNotMatch(sql, /app\.seed_default_users/);
  const provisioning = fs.readFileSync(path.join(__dirname, '../scripts/provision-db.js'), 'utf8');
  assert.doesNotMatch(provisioning, /DELETE FROM app_users/);
});
