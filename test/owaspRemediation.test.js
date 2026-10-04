const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const express = require('express');
const multer = require('multer');
const { createUploadCapacity } = require('../src/middleware/uploadCapacity');
const { createBoundedUploadStorage } = require('../src/services/boundedUploadStorage');
const { createAuditRecovery } = require('../src/services/auditRecoveryService');

test('upload capacity rejects excess requests and releases slots exactly once', () => {
  const guard = createUploadCapacity({ maxActive: 2, maxPerUser: 1 });
  const response = () => Object.assign(new EventEmitter(), { set() {}, status(code) { this.code = code; return this; }, json() {} });
  const request = username => ({ user: { username }, is: () => true });
  let passed = 0;
  const first = response();
  guard(request('alice'), first, () => passed++);
  const duplicate = response(); guard(request('alice'), duplicate, () => passed++);
  assert.equal(duplicate.code, 429);
  const second = response(); guard(request('bob'), second, () => passed++);
  const full = response(); guard(request('carol'), full, () => passed++);
  assert.equal(full.code, 429);
  first.emit('finish'); first.emit('close');
  guard(request('alice'), response(), () => passed++);
  assert.equal(passed, 3);
});

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('streamed multipart aggregate limit rejects excess and removes all staged files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-bounded-upload-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const app = express();
  const upload = multer({ storage: createBoundedUploadStorage(directory, 12) });
  app.post('/', upload.array('files', 20), async (req, res) => {
    const sizes = req.files.map(file => file.size);
    await Promise.all(req.files.map(file => fs.rm(file.path)));
    res.json(sizes);
  });
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const url = await listen(t, app);
  const send = async sizes => {
    const body = new FormData();
    sizes.forEach(size => body.append('files', new Blob([Buffer.alloc(size)]), 'evidence.pdf'));
    return fetch(url, { method: 'POST', body });
  };
  const valid = await send([6, 6]);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), [6, 6]);
  const excess = await send([7, 7]);
  assert.equal(excess.status, 413);
  assert.deepEqual(await fs.readdir(directory), []);
  assert.equal((await send([5])).status, 200);
});

test('audit survives database outage and process recreation, then retries successfully', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-audit-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const alerts = [];
  const offline = createAuditRecovery({ directory, writeEvent: async () => { throw new Error('database unavailable'); }, alert: message => alerts.push(message) });
  await offline.save({ requestId: 'retained-request', details: { password: '[redacted]', action: 'data.update' } });
  assert.equal((await fs.readdir(directory)).length, 1);
  await offline.recover();
  assert.equal((await fs.readdir(directory)).length, 1);
  const events = [];
  const online = createAuditRecovery({ directory, writeEvent: async event => events.push(event), alert: () => {} });
  await online.recover();
  assert.equal(events[0].requestId, 'retained-request');
  assert.equal(events[0].details.password, '[redacted]');
  assert.ok(events[0].details.auditCapturedAt);
  assert.deepEqual(await fs.readdir(directory), []);
  assert.ok(alerts.some(message => message.includes('retaining event')));
});

test('replacement denies non-owner before multipart storage receives file bytes', async t => {
  const access = require('../src/services/evidenceAccessService');
  const permissions = require('../src/services/permissionService');
  const controller = require('../src/controllers/fileController');
  let stored = false;
  t.mock.method(permissions, 'hasFileAction', async () => true);
  t.mock.method(access, 'assertAccess', async () => { throw Object.assign(new Error('Evidence bukan milik Anda'), { status: 403 }); });
  t.mock.method(controller.replacementUpload.storage, '_handleFile', (req, file, callback) => { stored = true; callback(new Error('Unexpected upload')); });
  const app = express();
  app.use((req, res, next) => { req.user = { username: 'alice', role: 'user' }; next(); });
  app.use('/files', require('../src/routes/fileRoutes'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const url = await listen(t, app);
  const body = new FormData(); body.append('file', new Blob(['%PDF-test']), 'test.pdf');
  const response = await fetch(`${url}/files/Govern/Policy/other.pdf`, { method: 'PUT', body });
  assert.equal(response.status, 403);
  assert.equal(stored, false);
});

test('password limiter shares account budget across both routes without limiting name updates', async t => {
  const { pool } = require('../src/config/database');
  const auth = require('../src/config/auth');
  const accounts = require('../src/services/accountService');
  const user = 'password-limit-test';
  t.mock.method(accounts, 'updatePassword', async () => { throw Object.assign(new Error('Password saat ini salah'), { status: 400 }); });
  t.mock.method(accounts, 'updateProfile', async () => ({ fullName: 'Updated' }));
  const token = auth.createSession({ username: user, role: 'admin' });
  t.after(() => { auth.destroySession(token); return pool.end(); });
  const app = express(); app.use(express.json());
  app.use('/auth', require('../src/routes/authRoutes'));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const url = await listen(t, app);
  const send = (route, body) => fetch(`${url}/auth${route}`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: `nist_session=${token}` }, body: JSON.stringify(body) });
  for (let index = 0; index < 10; index++) assert.equal((await send(index % 2 ? '/me' : '/me/password', { currentPassword: 'incorrect' })).status, index % 2 ? 200 : 400);
  const blocked = await send('/me/password', { currentPassword: 'incorrect' });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
  assert.equal((await send('/me', { fullName: 'Updated' })).status, 200);
});
