const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const express = require('express');
const files = require('../src/controllers/fileController');
const policies = require('../src/controllers/policyRegisterController');
const { errorHandler } = require('../src/middleware/errorHandler');
const { pool } = require('../src/config/database');

test.after(() => pool.end());

for (const [name, upload] of [['files', files.upload], ['replacement', files.replacementUpload], ['policy', policies.upload]]) {
  test(`${name}: accepts 38 MB and 100 MB, rejects above 100 MB with 413`, async t => {
    const app = express();
    app.post('/:path', upload.single('file'), async (req, res) => {
      const size = req.file.size;
      if (req.file.path) await fs.rm(req.file.path, { force: true });
      res.json({ size });
    });
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/evidence.pdf`;
    for (const size of [38 * 1024 * 1024, 100 * 1024 * 1024, 100 * 1024 * 1024 + 1]) {
      const body = new FormData();
      body.append('file', new Blob([Buffer.alloc(size)], { type: 'application/pdf' }), 'evidence.pdf');
      const response = await fetch(url, { method: 'POST', body });
      const result = await response.json();
      if (size <= 100 * 1024 * 1024) {
        assert.equal(response.status, 200);
        assert.equal(result.size, size);
      } else {
        assert.equal(response.status, 413);
        assert.match(result.error, /Ukuran file/);
      }
    }
  });
}
