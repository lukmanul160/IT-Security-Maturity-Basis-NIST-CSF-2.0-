const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/config/database');
const auth = require('../src/config/auth');
const files = require('../src/services/fileService');

async function run() {
  const user = (await pool.query("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(user, 'Existing administrator required');
  const token = auth.createSession({ username: user.username, role: 'admin' });
  const server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `${auth.sessionCookie}=${token}` };
  const suffix = randomUUID(), uploaded = [];
  let noteId;
  try {
    for (const module of ['TPRM Vendor Documents', 'Policy Register', 'ISO 27001', 'NIST CSF']) {
      const body = new FormData();
      body.append('functionName', module); body.append('kind', 'policy');
      body.append('files', new Blob(['test document'], { type: 'application/pdf' }), `upload-check-${suffix}.pdf`);
      const response = await fetch(`${base}/api/files/batch`, { method: 'POST', headers, body });
      assert.equal(response.status, 201, `${module} upload`);
      uploaded.push(...await response.json());
    }
    const title = `upload-check-${suffix}`;
    const body = new FormData();
    const original = '# Original\r\nKnowledge import with original bytes.\r\n';
    body.append('payload', JSON.stringify({ notes: [{ title, content: original, folder: '' }], folders: [] }));
    body.append('paths', '[]'); body.append('documentPaths', JSON.stringify([`${title}.md`]));
    body.append('documents', new Blob([original], { type: 'text/plain' }), `${title}.md`);
    const imported = await fetch(`${base}/api/knowledge-notes/import-with-images`, { method: 'POST', headers, body });
    assert.equal(imported.status, 201, 'Knowledge original upload');
    noteId = (await imported.json()).find(note => note.title === title).id;
    const response = await fetch(`${base}/api/files?details=true`, { headers });
    assert.equal(response.status, 200);
    const library = await response.json();
    for (const file of uploaded) assert.ok(library.some(item => item.path === file.path), 'Uploaded module file missing');
    assert.equal(library.find(item => item.path === uploaded[0].path).module, 'TPRM');
    const knowledge = library.find(item => item.name === `${title}.md`);
    assert.ok(knowledge); uploaded.push(knowledge); assert.equal(knowledge.module, 'Knowledge Notes');
    const originalRead = await fetch(`${base}/api/files/${knowledge.path.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`, { headers });
    assert.equal(originalRead.status, 200); assert.equal(await originalRead.text(), original);
    console.log('PASS: real authenticated uploads from TPRM, Policy, ISO, CSF and Knowledge appear in Uploaded Files; Knowledge originals retain exact bytes.');
  } finally {
    for (const file of uploaded) await files.deleteFile(file.path, { library: true });
    if (noteId) await pool.query('DELETE FROM knowledge_notes WHERE id=$1', [noteId]);
    auth.destroySession(token);
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
