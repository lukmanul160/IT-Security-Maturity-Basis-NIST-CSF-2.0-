const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('startup creates schema without shared passwords and preserves existing accounts', async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../database/users.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_users/);
  assert.doesNotMatch(sql, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+app_users/i);
  assert.doesNotMatch(sql, /\$2[aby]\$/);
  assert.doesNotMatch(sql, /app\.seed_default_users/);
  const provisioning = fs.readFileSync(path.join(__dirname, '../scripts/provision-db.js'), 'utf8');
  assert.doesNotMatch(provisioning, /DELETE FROM app_users/);
});
