const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { after } = require('node:test');
const { pool } = require('../src/config/database');
const { uploadRoot } = require('../src/config/paths');
const fileService = require('../src/services/fileService');

after(() => pool.end());

test('replaceFile keeps the evidence path and updates its content and metadata', async () => {
  const token = crypto.randomBytes(8).toString('hex');
  const relativePath = `Test Replace/${token}/evidence.pdf`;
  const target = path.join(uploadRoot, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'old content');

  try {
    const replacement = Buffer.from('%PDF-1.4 replacement');
    const result = await fileService.replaceFile(relativePath, {
      buffer: replacement,
      originalname: 'new-version.pdf',
      mimetype: 'application/pdf',
      size: replacement.length,
    });

    assert.equal(result.path, `upload/${relativePath}`);
    assert.equal(result.name, 'evidence.pdf');
    assert.deepEqual(await fs.readFile(target), replacement);
    const stored = await pool.query('SELECT name, mime_type FROM evidence_files WHERE path = $1', [relativePath]);
    assert.deepEqual(stored.rows[0], { name: 'evidence.pdf', mime_type: 'application/pdf' });

    await assert.rejects(
      fileService.replaceFile(relativePath, { buffer: Buffer.from('doc'), originalname: 'wrong.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 3 }),
      { status: 400 }
    );
  } finally {
    await pool.query('DELETE FROM evidence_files WHERE path = $1', [relativePath]);
    await fs.rm(target, { force: true });
    await fs.rmdir(path.dirname(target)).catch(() => {});
    await fs.rmdir(path.join(uploadRoot, 'Test Replace')).catch(() => {});
  }
});
