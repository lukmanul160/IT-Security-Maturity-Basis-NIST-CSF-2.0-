const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const express = require('express');

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('database restore streams more than 500 MiB to disk independently of website import limits', async t => {
  const service = require('../src/services/backupService');
  const controller = require('../src/controllers/backupController');
  const original = service.restoreBackup;
  const size = 501 * 1024 * 1024;
  let received;
  service.restoreBackup = async file => {
    try {
      received = (await fs.stat(file.path)).size;
      assert.equal(file.buffer, undefined);
      return { restored: true, size: received };
    } finally { await fs.rm(file.path, { force: true }); }
  };
  t.after(() => { service.restoreBackup = original; });
  const app = express();
  app.use((req, res, next) => { req.fileLimits = { importMb: 1 }; next(); });
  app.post('/restore', controller.restoreUpload.single('backup'), controller.restore);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const base = await listen(t, app);
  const boundary = 'large-database-test';
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="backup"; filename="nist-basis-20261019T000000Z.dump"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const request = http.request(base + '/restore', { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': prefix.length + size + suffix.length } });
  const response = new Promise((resolve, reject) => {
    request.on('error', reject);
    request.on('response', async res => {
      try { const chunks = []; for await (const chunk of res) chunks.push(chunk); resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }); }
      catch (error) { reject(error); }
    });
  });
  await pipeline(Readable.from((function* () {
    yield prefix;
    const chunk = Buffer.alloc(1024 * 1024, 42);
    for (let sent = 0; sent < size; sent += chunk.length) yield chunk;
    yield suffix;
  })()), request);
  assert.deepEqual(await response, { status: 200, data: { restored: true, size } });
  assert.equal(received, size);
});

test('database dump download supports a range from a 6 GiB file despite general export limits', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-large-dump-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'nist-basis-20261019T000000Z.dump');
  const handle = await fs.open(file, 'w');
  const size = 6 * 1024 ** 3;
  try { await handle.truncate(size); await handle.write(Buffer.from('tail'), 0, 4, size - 4); }
  finally { await handle.close(); }
  const app = express();
  app.use(require('../src/middleware/fileLimits').fileLimits);
  app.get('/backups/:file', (req, res) => res.download(file));
  const base = await listen(t, app);
  const response = await fetch(base + '/backups/' + path.basename(file), { headers: { Range: `bytes=${size - 4}-${size - 1}` } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes ${size - 4}-${size - 1}/${size}`);
  assert.equal(await response.text(), 'tail');
});
