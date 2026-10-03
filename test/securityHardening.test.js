const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/config/auth');
const { pool } = require('../src/config/database');
const accounts = require('../src/services/accountService');
const { createLoginRateLimit } = require('../src/middleware/loginRateLimit');
test.after(() => pool.end());

test('new login replaces same account session without affecting other accounts', () => {
  const first = auth.createSession({ username: 'single-device', role: 'user' });
  const other = auth.createSession({ username: 'independent-device', role: 'viewer' });
  const latest = auth.createSession({ username: 'single-device', role: 'user' });
  assert.equal(auth.getSession(first), null);
  assert.equal(auth.getSession(latest).username, 'single-device');
  assert.equal(auth.getSession(other).username, 'independent-device');
  auth.destroySession(first);
  assert.ok(auth.getSession(latest), 'old device logout cannot end new login');
  auth.destroySession(latest);
  auth.destroySession(other);
});

test('failed login does not revoke active device', async t => {
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash('ValidPassword123', 4);
  t.mock.method(pool, 'query', async () => ({ rows: [{ username: 'single-device', password_hash: passwordHash, role: 'user' }] }));
  const token = auth.createSession({ username: 'single-device', role: 'user' });
  assert.equal(await auth.authenticate('single-device', 'WrongPassword123'), null);
  assert.ok(auth.getSession(token));
  auth.destroySession(token);
});

test('role changes and deletion revoke every session for the affected account', async t => {
  t.mock.method(pool, 'query', async () => ({ rowCount: 1, rows: [{ id: 1, username: 'target', role: 'viewer' }] }));
  const unaffected = auth.createSession({ username: 'other', role: 'user' });
  const first = auth.createSession({ username: 'target', role: 'admin' });
  const second = auth.createSession({ username: 'target', role: 'admin' });
  await accounts.updateUser(1, { role: 'viewer' });
  assert.equal(auth.getSession(first), null);
  assert.equal(auth.getSession(second), null);
  assert.ok(auth.getSession(unaffected));
  const deleted = auth.createSession({ username: 'target', role: 'viewer' });
  await accounts.deleteUser(1, 'other');
  assert.equal(auth.getSession(deleted), null);
  auth.destroySession(unaffected);
});

test('password change revokes existing sessions', async t => {
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash('Original123', 4);
  t.mock.method(pool, 'query', async () => ({ rowCount: 1, rows: [{ id: 1, username: 'target', password_hash: passwordHash, role: 'user' }] }));
  const token = auth.createSession({ username: 'target', role: 'user' });
  await accounts.updatePassword('target', { currentPassword: 'Original123', newPassword: 'Replacement123', confirmPassword: 'Replacement123' });
  assert.equal(auth.getSession(token), null);
});

test('bcrypt passwords exceeding 72 UTF-8 bytes are rejected before database writes', async () => {
  await assert.rejects(accounts.createUser({ username: 'target', password: 'Aa1' + 'é'.repeat(35) }), { status: 400 });
});

test('login limit cannot be bypassed by rotating usernames and expires', () => {
  let time = 0;
  const middleware = createLoginRateLimit({ limit: 2, windowMs: 1000, maxPeers: 2, now: () => time });
  let passed = 0;
  const res = { status(code) { this.code = code; return this; }, set(name, value) { this[name] = value; }, json() {} };
  for (const username of ['one', 'two', 'three']) middleware({ ip: 'peer', body: { username } }, res, () => passed++);
  assert.equal(passed, 2);
  assert.equal(res.code, 429);
  assert.equal(res['Retry-After'], '1');
  time = 1000;
  middleware({ ip: 'peer' }, res, () => passed++);
  assert.equal(passed, 3);
});

test('login limiter bounds peer storage without evicting active limits', () => {
  const middleware = createLoginRateLimit({ maxPeers: 1 });
  let passed = 0;
  const res = { status(code) { this.code = code; return this; }, json() {} };
  middleware({ ip: 'first' }, res, () => passed++);
  middleware({ ip: 'second' }, res, () => passed++);
  assert.equal(passed, 1);
  assert.equal(res.code, 429);
});

test('uploaded content is sandboxed even when stored MIME type claims HTML', async t => {
  const controller = require('../src/controllers/fileController');
  const files = require('../src/services/fileService');
  const access = require('../src/services/evidenceAccessService');
  t.mock.method(access, 'assertReadAccess', async () => {});
  t.mock.method(files, 'readFile', async () => ({ type: 'text/html', content: Buffer.from('<script>alert(1)</script>') }));
  const headers = {};
  const res = { set(name, value) { headers[name] = value; return this; }, type() { return this; }, send() {} };
  await controller.download({ params: { path: ['audit-finding', 'payload.pdf'] }, user: { username: 'target' } }, res);
  assert.match(headers['Content-Security-Policy'], /^sandbox;/);
  assert.match(headers['Content-Security-Policy'], /default-src 'none'/);
});

test('invalid upload metadata removes staged files', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const controller = require('../src/controllers/fileController');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-upload-test-'));
  try {
    const filePath = path.join(directory, 'staged.pdf');
    await fs.writeFile(filePath, '%PDF-test');
    await assert.rejects(controller.create({ file: { path: filePath, originalname: 'test.pdf', mimetype: 'application/pdf' }, body: { functionName: 'Govern', kind: 'invalid' } }, {}), { status: 400 });
    await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
