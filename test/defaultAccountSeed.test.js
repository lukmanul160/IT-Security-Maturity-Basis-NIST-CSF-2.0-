const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

test('fresh PostgreSQL seeds admin, preserves changed passwords and other existing accounts', async () => {
  // Own disposable cluster; never load .env or connect to the application database.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-account-seed-'));
  const pgBin = process.env.PERF_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  const run = (name, args) => execFileSync(path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')), args, { windowsHide: true, stdio: 'ignore', timeout: 60000 });
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  let started = false, client;
  try {
    run('initdb', ['-D', path.join(root, 'pg'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8', '--no-sync']);
    run('pg_ctl', ['-D', path.join(root, 'pg'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
    started = true;
    client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password: '', ssl: false });
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, '../database/users.sql'), 'utf8');
    await client.query(sql);
    let users = (await client.query('SELECT * FROM app_users')).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'admin');
    assert.equal(users[0].role, 'admin');
    assert.ok(await bcrypt.compare('admin', users[0].password_hash));
    const changedHash = await bcrypt.hash('ChangedPassword123', 4);
    await client.query('UPDATE app_users SET password_hash=$1', [changedHash]);
    await client.query(sql);
    users = (await client.query('SELECT * FROM app_users')).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].password_hash, changedHash);
    await client.query("UPDATE app_users SET username='existing-operator', role='viewer'");
    await client.query(sql);
    users = (await client.query('SELECT * FROM app_users')).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].username, 'existing-operator');
    assert.equal(users[0].role, 'viewer');
    assert.equal(users[0].password_hash, changedHash);
  } finally {
    if (client) await client.end();
    if (started) run('pg_ctl', ['-D', path.join(root, 'pg'), '-m', 'immediate', '-w', 'stop']);
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('nist-account-seed-')) throw Error('Unexpected temporary path');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
