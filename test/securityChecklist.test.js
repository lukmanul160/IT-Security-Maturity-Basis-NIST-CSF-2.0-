// Never read installation credentials. Integration runs only in the disposable runner.
require('dotenv').config = () => ({ parsed: {} });
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/securityChecklistService');
const permissions = require('../src/services/permissionService');
const { pool } = require('../src/config/database');
const owner = { username: 'maker', role: 'editor' }, assessor = { username: 'assessor', role: 'user' };
const input = () => ({ kind: 'assignment', title: 'Security review', assessor: 'assessor', version: 0, columns: structuredClone(service.defaults), rows: [{ id: 'r1', values: { id: 'CHK-1', area: 'Access', how: 'Review accounts', expected: 'Least privilege', status: '', evidence: '', pic: '' } }] });

test('seven defaults support custom ordered columns and select options', () => {
  const data = input();
  assert.equal(service.validate(data).columns.length, 7);
  data.columns.unshift({ id: 'priority', label: 'Prioritas', type: 'select', phase: 'definition', options: ['High', 'Low'] });
  data.rows[0].values.priority = 'High';
  const result = service.validate(data);
  assert.equal(result.columns[0].label, 'Prioritas'); assert.equal(result.rows[0].values.priority, 'High');
});
test('invalid schema, duplicate identities and invalid results are rejected', () => {
  for (const modify of [d => d.columns.push(d.columns[0]), d => d.rows.push(d.rows[0]), d => { d.columns[0].id = null; }, d => { d.columns[0].phase = 'unknown'; }, d => { d.rows[0].values.status = 'unknown'; }, d => { d.columns[4].options = ['Same', 'Same']; }, d => { d.title = ''; }, d => { d.version = -1; }, d => { d.rows[0].values.evidence = 'a'.repeat(4001); }]) {
    const data = input(); modify(data); assert.throws(() => service.validate(data), { status: 400 });
  }
});
test('owners/admin manage definitions; assigned assessor can only assess', () => {
  const row = { owner: 'maker', assessor: 'assessor' };
  service.authorize(row, owner); service.authorize(row, { username: 'admin', role: 'admin' });
  service.authorize(row, assessor, true);
  assert.throws(() => service.authorize(row, assessor), { status: 403 });
  assert.throws(() => service.authorize(row, { username: 'other', role: 'editor' }, true), { status: 403 });
});
test('viewer defaults are read-only while normal users can create and assess', () => {
  assert.equal(permissions.canAccess('viewer', 'compliance-security-checklist', 'read'), true);
  for (const action of ['create', 'update', 'delete']) assert.equal(permissions.canAccess('viewer', 'compliance-security-checklist', action), false);
  assert.equal(permissions.canAccess('user', 'compliance-security-checklist', 'update'), true);
});
test('evidence validates target, type, empty content and request limits', () => {
  const file = { originalname: '../evidence.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nFixture') };
  const data = { fileTargets: [{ rowId: 'r1', columnId: 'evidence' }] };
  assert.equal(service.validateUploads([file], data)[0].name.includes('/'), false);
  assert.throws(() => service.validateUploads([file], {}), { status: 400 });
  assert.throws(() => service.validateUploads([{...file,buffer:Buffer.from('<script>alert(1)</script>')}],data),{status:400});
  assert.throws(() => service.validateUploads([{...file,originalname:'photo.png',mimetype:'image/png'}],data),{status:400});
  assert.throws(() => service.validateUploads([{ ...file, buffer: Buffer.alloc(0) }], data), { status: 400 });
  assert.throws(() => service.validateUploads([{ ...file, originalname: 'evidence.html', mimetype: 'text/html' }], data), { status: 400 });
  assert.throws(() => service.validateUploads(Array(11).fill(file), { fileTargets: Array(11).fill(data.fileTargets[0]) }), { status: 400 });
});

test('PostgreSQL CRUD, assignment isolation, restricted assessments and stale writes', { skip: !process.env.NIST_TEST_ROOT }, async () => {
  const client = await pool.connect(), originalQuery = pool.query, originalConnect = pool.connect;
  let server;
  try {
    await client.query(`CREATE TEMP TABLE app_users(username TEXT PRIMARY KEY, full_name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL);
      INSERT INTO app_users VALUES ('maker','Maker','editor'),('assessor','Assessor','user'),('other','Other','editor'),('viewer','Viewer','viewer');
      CREATE TEMP TABLE role_permissions(role TEXT,permission_key TEXT,allowed BOOLEAN,actions JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(role,permission_key));
      CREATE TEMP TABLE compliance_security_checklists(id UUID PRIMARY KEY,owner TEXT,title TEXT,assessor TEXT,data JSONB,version INTEGER DEFAULT 1,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TEMP TABLE compliance_security_checklist_files(id UUID PRIMARY KEY,checklist_id UUID REFERENCES compliance_security_checklists(id) ON DELETE CASCADE,row_id TEXT,column_id TEXT,name TEXT,mime_type TEXT,content BYTEA,created_at TIMESTAMPTZ DEFAULT NOW());`);
    pool.query = (sql, ...args) => client.query(typeof sql === 'string' ? sql.replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS') : sql, ...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    await permissions.ensureStore();
    const express = require('express'), app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = req.headers['x-fixture-user'] === 'viewer' ? { username: 'viewer', role: 'viewer' } : assessor; next(); });
    app.use('/checklists', require('../src/routes/securityChecklistRoutes'));
    app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
    server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const base = 'http://127.0.0.1:' + server.address().port + '/checklists';
    assert.equal((await fetch(base, { method: 'POST', headers: { 'x-fixture-user': 'viewer', 'Content-Type': 'application/json' }, body: JSON.stringify(input()) })).status, 403);
    assert.equal((await fetch(base + '/invalid', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
    assert.ok(!(await service.users()).some(u => u.username === 'viewer'));
    let saved = await service.save(null, input(), owner);
    assert.equal(saved.version, 1); assert.equal(saved.owner, owner.username);
    assert.equal((await service.list(assessor)).length, 1);
    assert.equal((await (await fetch(base)).json()).checklists.length, 1);
    assert.equal((await fetch(base + '/' + saved.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input(), version: 1 }) })).status, 403);
    assert.equal((await fetch(base + '/' + saved.id + '/assessment', { method: 'PATCH', headers: { 'x-fixture-user': 'viewer', 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, rows: [] }) })).status, 403);
    assert.equal((await service.list({ username: 'other', role: 'editor' })).length, 0);
    await assert.rejects(service.save(saved.id, { ...input(), version: 1 }, assessor), { status: 403 });
    await assert.rejects(service.save(saved.id, { version: 1, rows: [{ id: 'r1', values: { area: 'tampered' } }] }, assessor, true), { status: 403 });
    await assert.rejects(service.save(saved.id, { version: 1, rows: [null] }, assessor, true), { status: 400 });
    saved = await service.save(saved.id, { version: 1, rows: [{ id: 'r1', values: { status: 'Sesuai', evidence: 'Document A', pic: 'IT / Q4' } }] }, assessor, true);
    assert.equal(saved.data.rows[0].values.area, 'Access'); assert.equal(saved.data.rows[0].values.status, 'Sesuai');
    assert.equal(saved.version, 2);
    await assert.rejects(service.save(saved.id, { ...input(), version: 1 }, owner), { status: 409 });
    await assert.rejects(service.save(null, { ...input(), assessor: 'viewer' }, owner), { status: 400 });
    await assert.rejects(service.remove(saved.id, 1, owner), { status: 409 });
    await assert.rejects(service.remove(saved.id, 2, assessor), { status: 409 });
    const reassigned = await service.save(saved.id, { ...input(), version: 2, assessor: 'maker' }, owner);
    assert.equal((await service.list(assessor)).length, 0);
    await assert.rejects(service.save(saved.id, { version: 3, rows: [{ id: 'r1', values: { status: 'Sesuai' } }] }, assessor, true), { status: 403 });
    await service.remove(saved.id, reassigned.version, owner);
    assert.equal((await service.list(owner)).length, 0);
    // Real multipart route plus BYTEA download; files and results commit together.
    const evidenceRecord = await service.save(null, input(), owner);
    const body = new FormData();
    body.append('data', JSON.stringify({ version: 1, rows: [{ id: 'r1', values: { evidence: 'Review attachment' } }], fileTargets: [{ rowId: 'r1', columnId: 'evidence' }] }));
    body.append('files', new Blob(['%PDF-1.7\nFixture'], { type: 'application/pdf' }), 'evidence.pdf');
    const uploadedResponse = await fetch(base + '/' + evidenceRecord.id + '/assessment', { method: 'PATCH', body });
    assert.equal(uploadedResponse.status, 200);
    let withEvidence = await uploadedResponse.json();
    assert.equal(withEvidence.files.length, 1); assert.equal(withEvidence.version, 2);
    const fileId = withEvidence.files[0].id;
    const secureDownload=await fetch(base+'/'+evidenceRecord.id+'/files/'+fileId);assert.equal(secureDownload.status,200);assert.match(secureDownload.headers.get('content-security-policy'),/sandbox/);assert.match(secureDownload.headers.get('cache-control'),/no-store/);assert.equal(secureDownload.headers.get('x-content-type-options'),'nosniff');
    await assert.rejects(service.authorizeUpload(evidenceRecord.id,{username:'other',role:'editor'},true),{status:403});

    const downloaded = await fetch(base + '/' + evidenceRecord.id + '/files/' + fileId);
    assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.equal(await downloaded.text(), '%PDF-1.7\nFixture');
    assert.equal((await fetch(base + '/' + evidenceRecord.id + '/files/' + fileId, { headers: { 'x-fixture-user': 'viewer' } })).status, 404);
    const upload = { originalname: 'evidence.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7 Fixture') };
    await assert.rejects(service.save(evidenceRecord.id, { version: 2, rows: [{ id: 'r1', values: {} }], fileTargets: [{ rowId: 'r1', columnId: 'area' }] }, assessor, true, [upload]), { status: 403 });
    assert.equal((await service.list(owner))[0].version, 2, 'failed upload rolls back result/version changes');
    withEvidence = await service.save(evidenceRecord.id, { version: 2, rows: [{ id: 'r1', values: { evidence: 'Kept' } }] }, assessor, true);
    assert.equal(withEvidence.files.length, 1, 'editing text retains attachments');
    withEvidence = await service.save(evidenceRecord.id, { version: 3, rows: [{ id: 'r1', values: {} }], removeFiles: [fileId] }, assessor, true);
    assert.equal(withEvidence.files.length, 0);
    await assert.rejects(service.download(evidenceRecord.id, fileId, owner), { status: 404 });
    withEvidence = await service.save(evidenceRecord.id, { version: 4, rows: [{ id: 'r1', values: {} }], fileTargets: [{ rowId: 'r1', columnId: 'evidence' }] }, assessor, true, [upload]);
    const changedAssessor = await service.save(evidenceRecord.id, { ...input(), assessor: 'maker', version: 5 }, owner);
    await assert.rejects(service.download(evidenceRecord.id, withEvidence.files[0].id, assessor), { status: 404 });
    await service.remove(evidenceRecord.id, changedAssessor.version, owner);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM compliance_security_checklist_files')).rows[0].n, 0);
    const templateInput = input(); delete templateInput.assessor;
    templateInput.rows[0].values.status = 'Sesuai';
    const template = await service.createTemplate(templateInput, owner, []);
    assert.equal(template.kind, 'template');
    assert.equal(template.data.rows[0].values.status, '', 'templates never store assessment results');
    const app1 = await service.createAssignment({ templateId: template.id, title: 'Aplikasi 1', assessor: assessor.username }, owner);
    const app2 = await service.createAssignment({ templateId: template.id, title: 'Aplikasi 2', assessor: owner.username }, owner);
    assert.notEqual(app1.id, app2.id); assert.equal(app1.template_id, app2.template_id);
    await assert.rejects(service.save(template.id, { version: 1, rows: [{ id: 'r1', values: {} }] }, owner, true), { status: 400 });
    await service.save(app1.id, { version: 1, rows: [{ id: 'r1', values: { status: 'Sesuai' } }] }, assessor, true);
    let snapshots = await service.list(owner);
    assert.equal(snapshots.find(r => r.id === app2.id).data.rows[0].values.status, '');
    const editTemplate = { ...templateInput, version: 1, rows: [{ id: 'r1', values: { ...templateInput.rows[0].values, area: 'Changed template' } }] };
    await service.save(template.id, editTemplate, owner);
    snapshots = await service.list(owner);
    assert.equal(snapshots.find(r => r.id === app1.id).data.rows[0].values.area, 'Access');
    assert.equal(snapshots.find(r => r.id === app2.id).data.rows[0].values.area, 'Access');
    await assert.rejects(service.save(app2.id, { ...input(), version: 1 }, owner), { status: 400 });
    await assert.rejects(service.updateAssignment(app1.id, { version: 2, title: 'Attempt', assessor: 'maker' }, assessor), { status: 409 });
    await service.updateAssignment(app1.id, { version: 2, title: 'Aplikasi 1 - Q4', assessor: 'maker' }, owner);
    assert.ok(!(await service.list(assessor)).some(r => r.id === app1.id), 'reassigned application is hidden from prior assessor');
    await service.remove(template.id, 2, owner);
    assert.ok((await service.list(owner)).some(r => r.id === app1.id), 'deleting a template preserves assignment snapshots');
    await service.remove(app1.id, 3, owner); await service.remove(app2.id, 1, owner);
    await assert.rejects(service.createAssignment({ templateId: template.id, title: 'Deleted template', assessor: 'maker' }, owner), { status: 404 });
    const templateResponse = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(templateInput) });
    assert.equal(templateResponse.status, 201);
    const apiTemplate = await templateResponse.json(); assert.equal(apiTemplate.kind, 'template');
    const assignmentResponse = await fetch(base + '/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: apiTemplate.id, title: 'Aplikasi 3', assessor: 'maker' }) });
    assert.equal(assignmentResponse.status, 201);
    const apiAssignment = await assignmentResponse.json(); assert.equal(apiAssignment.kind, 'assignment');
    const metadataResponse = await fetch(base + '/' + apiAssignment.id + '/assignment-info', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, title: 'Aplikasi 3 - Q4', assessor: 'assessor' }) });
    assert.equal(metadataResponse.status, 200); assert.equal((await metadataResponse.json()).title, 'Aplikasi 3 - Q4');
    await service.remove(apiTemplate.id, 1, { username: 'admin', role: 'admin' });
    await service.remove(apiAssignment.id, 2, { username: 'admin', role: 'admin' });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = originalQuery; pool.connect = originalConnect;
    await client.query('DROP TABLE IF EXISTS pg_temp.compliance_security_checklist_files, pg_temp.compliance_security_checklists, pg_temp.role_permissions, pg_temp.app_users');
    client.release(); await pool.end();
  }
});
