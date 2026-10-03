const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pool } = require('../src/config/database');
const service = require('../src/services/auditService');
const { sanitize, classify, auditRequest } = require('../src/middleware/audit');
test.after(() => pool.end());
test('audit removes nested credentials and binary content', () => {
  const value = sanitize({ password: 'secret', nested: { smtpPassword: 'secret', apiKey: 'secret', token: 'secret', content: 'binary', name: 'document.pdf' } });
  assert.equal(JSON.stringify(value).includes('secret'), false);
  assert.equal(value.nested.name, 'document.pdf');
});
test('audit distinguishes transfers, mutations and login', () => {
  for (const [method, url, extra, expected] of [['POST','/api/files', { file: {} },'file.upload'], ['GET','/api/files/test.pdf',{},'file.download'], ['POST','/api/risk-management',{},'data.create'], ['PUT','/api/risk-management/1',{},'data.update'], ['DELETE','/api/risk-management/1',{},'data.delete'], ['POST','/api/auth/login',{},'auth.login']]) {
    assert.equal(classify({ method, originalUrl: url, ...extra }, { getHeader: () => method === 'GET' ? 'attachment' : undefined }), expected);
  }
});
test('failed requests retain attempted action and safe details exactly once', async t => {
  const events = []; t.mock.method(service, 'record', async event => events.push(event));
  const res = new EventEmitter(); Object.assign(res, { statusCode: 403, writableFinished: true, set() {}, getHeader() {}, json(value) { return value; } });
  const req = { method: 'DELETE', originalUrl: '/api/files/document.pdf', headers: {}, user: { username: 'alice', role: 'user' }, params: { path: ['document.pdf'] }, query: {}, body: { password: 'secret' }, get() {}, ip: '127.0.0.1' };
  auditRequest(req, res, () => {}); res.json({ error: 'Forbidden' }); res.emit('finish'); res.emit('close');
  assert.equal(events.length, 1); assert.equal(events[0].actorUsername, 'alice'); assert.equal(events[0].eventType, 'request.error'); assert.equal(events[0].details.action, 'file.delete'); assert.equal(events[0].details.submitted.password, '[redacted]');
});
test('date filters are parameterized and invalid dates rejected', async t => {
  let query; t.mock.method(pool, 'query', async (sql, values) => { query = { sql, values }; return { rows: [] }; });
  await service.list({ actor: 'alice', from: '2026-10-01', to: '2026-10-03' });
  assert.ok(query.sql.includes('created_at >= $2')); assert.equal(query.values[0], 'alice');
  await assert.rejects(service.list({ from: 'invalid' }), { status: 400 });
});

test('transfer endpoint persists result and exposes database failure', async t => {
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = { username: 'alice', role: 'user' }; req.requestId = 'test-request'; next(); });
  app.use('/audit', require('../src/routes/auditRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const events = []; let fail = false;
  t.mock.method(service, 'record', async event => { if (fail) throw new Error('connection unavailable'); events.push(event); });
  const send = body => fetch(`http://127.0.0.1:${server.address().port}/audit/activity`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await send({ action: 'import', module: 'csf', filename: 'input.json', outcome: 'failed', count: 2, error: 'Access denied', message: 'Import berhenti sebagian' });
  assert.equal(response.status, 204); assert.equal(events[0].details.outcome, 'failed'); assert.equal(events[0].details.count, 2); assert.equal(events[0].details.error, 'Access denied'); assert.equal(events[0].actorUsername, 'alice');
  assert.equal((await send({ action: 'export', module: 'csf', outcome: 'unknown' })).status, 400);
  fail = true;
  const unavailable = await send({ action: 'export', module: 'csf', outcome: 'success' });
  assert.equal(unavailable.status, 503); assert.match((await unavailable.json()).error, /database/);
});
