const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRequestOriginGuard } = require('../src/middleware/requestOrigin');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

for (const secure of [false, true]) test(`CSRF payload matrix and legitimate clients (secure=${secure})`, async t => {
  const app = express();
  app.use(createRequestOriginGuard({ secure }));
  app.use((req, res) => res.sendStatus(204));
  const base = await listen(t, app);
  const origin = base.replace('http:', secure ? 'https:' : 'http:');
  const cases = [
    [{ origin }, 204],
    [{ origin: origin.replace(secure ? 'https:' : 'http:', secure ? 'http:' : 'https:') }, 403],
    [{ origin: 'https://attacker.invalid' }, 403],
    [{ origin: 'null' }, 403],
    [{ origin: `${origin}/fake` }, 403],
    [{ origin: origin.replace('://', '://user:pass@') }, 403],
    [{ referer: `${origin}/app` }, 204],
    [{ referer: 'https://attacker.invalid/form' }, 403],
    [{ 'sec-fetch-site': 'cross-site' }, 403],
    [{ origin, 'sec-fetch-site': 'cross-site' }, 403],
    [{ 'sec-fetch-site': 'same-origin', origin }, 204],
    [{}, 204], // legacy non-browser integrations
  ];
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const [headers, expected] of cases) {
      const response = await fetch(base, { method, headers });
      assert.equal(response.status, expected, `${method} ${JSON.stringify(headers)}`);
    }
  }
  assert.equal((await fetch(base, { headers: { origin: 'https://attacker.invalid' } })).status, 204);
});

test('real application: SQLi, session forgery, unauthenticated routes, role escalation and normal login', async t => {
  const { pool } = require('../src/config/database');
  const auth = require('../src/config/auth');
  const bcrypt = require('bcryptjs');
  const calls = [];
  const hash = await bcrypt.hash('FixturePassword123!', 4);
  t.mock.method(require('../src/services/websiteSettingsService'), 'read', async () => ({}));
  t.mock.method(require('pg').Pool.prototype, 'connect', async () => ({
    async query(sql) {
      assert.match(sql, /^SELECT pg_(?:try_advisory_lock|advisory_unlock)/);
      return { rows: [{ acquired: true }] };
    }, release() {},
  }));
  t.mock.method(pool, 'query', async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT username, password_hash, role')) {
      assert.equal(sql, 'SELECT username, password_hash, role FROM app_users WHERE username = $1');
      return { rows: values[0] === 'fixture-user' ? [{ username: 'fixture-user', password_hash: hash, role: 'user' }] : [] };
    }
    throw new Error('Unexpected database operation');
  });
  t.mock.method(require('../src/services/auditService'), 'record', async () => {});
  const base = await listen(t, require('../src/app'));
  for (const route of ['/api/auth/users', '/api/backups', '/api/file-backups', '/api/storage-settings', '/api/knowledge-notes']) {
    assert.equal((await fetch(base + route)).status, 401, route);
    assert.equal((await fetch(base + route, { headers: { cookie: 'nist_session=forged', 'x-forwarded-for': '127.0.0.1' } })).status, 401);
  }
  for (const username of ["' OR '1'='1'--", 'admin\u0000', { $ne: null }, 'a'.repeat(1000)]) {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'FixturePassword123!' }) });
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0, 'SQLi rejected before querying');
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'fixture-user', password: 'FixturePassword123!' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const token = cookie.match(/nist_session=([^;]+)/)[1];
  t.after(() => { auth.destroySession(token); return pool.end(); });
  for (const [route, method, body] of [
    ['/api/auth/users', 'GET'], ['/api/backups', 'GET'], ['/api/auth/users', 'POST', { username: 'evil', role: 'admin', password: 'FakePassword123' }],
    ['/api/auth/me', 'PUT', { role: 'admin' }],
  ]) {
    const response = await fetch(base + route, { method, headers: { cookie: `nist_session=${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, 403, route);
  }
  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: `nist_session=${token}`, origin: base } });
  assert.equal(logout.status, 204);
  assert.equal(auth.getSession(token), null);
  assert.equal(calls.length, 1, 'authorization blocks privileged database operations');
});
