const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pool } = require('../src/config/database');
const permission = require('../src/services/permissionService');
const access = require('../src/services/evidenceAccessService');

test('central library identifies uploads across TPRM, Knowledge, ISO, policy, audit and assets',()=>{
 for(const [filePath,label] of [['TPRM Vendor Documents/Policy/id/report.pdf','TPRM'],['Knowledge Notes/imports/id/note.md','Knowledge Notes'],['ISO 27001/Policy/id/report.pdf','ISO 27001'],['Policy Register/Policy/id/policy.pdf','Policy Register'],['audit-finding/id/report.pdf','Audit Finding'],['Asset Management/assets/id/front/version/photo.png','Asset Register'],['Asset Management/racks/id/front/version/photo.png','Rak Server']])assert.equal(access.fileModule(filePath),label);
});

test('searchable evidence receives only linked Vault content with read permission', async t => {
  let allowed = true;
  let knowledgeQueries = 0;
  t.mock.method(permission, 'has', async () => allowed);
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('FROM app_users')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM evidence_files')) return { rows: [{path:'policy/a.pdf',name:'A.pdf'}] };
    assert.deepEqual(params[0], ['policy/a.pdf']);
    if (sql.includes('JOIN knowledge_notes')) {
      knowledgeQueries++;
      assert.match(sql, /p\.related_note_ids @>/);
      return { rows: [{path:'policy/a.pdf',id:2,title:'Accounts',folder:'Security',content:'Rotate privileged credentials'}] };
    }
    return { rows: [{path:'policy/a.pdf',title:'General policy',notes:'Quarterly approval',subtitle:'Access',content:'Review accounts'}] };
  });
  const user = {username:'alice',role:'user'};
  const file = (await access.searchableList(user))[0];
  assert.equal(file.knowledgeDetails[0].content, 'Rotate privileged credentials');
  assert.equal(file.policyDetails[0].notes, 'Quarterly approval');
  allowed = false;
  assert.deepEqual((await access.searchableList(user))[0].knowledgeDetails, []);
  assert.equal(knowledgeQueries, 1);
});

test('shared picker search matches filenames, policy notes/content and linked Vault with escaped previews', () => {
  const source = fs.readFileSync('frontend/client/src/workspace/features/uploaded-files/evidence-library.js', 'utf8');
  const context = vm.createContext({ escapeHtml: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') });
  vm.runInContext(source.slice(0,source.indexOf("document.addEventListener('click'")), context);
  context.file = {name:'General.pdf',path:'upload/policy/a.pdf',policyDetails:[{title:'Security',notes:'Quarterly approval',content:'Review accounts'}],knowledgeDetails:[{title:'Credentials',folder:'Access/Admin',content:'Rotate <script> privileged credentials'}]};
  for (const query of ['GENERAL.PDF', 'quarterly approval', 'review accounts', 'Access/Admin', 'privileged   credentials']) {
    context.query = query;
    assert.equal(vm.runInContext('evidenceMatches(file, query)',context), true, query);
  }
  context.query = 'unlinked content';
  assert.equal(vm.runInContext('evidenceMatches(file, query)',context), false);
  context.query = 'privileged';
  const preview = vm.runInContext('evidenceMatchPreview(file, query)',context);
  assert.match(preview,/Konten Knowledge Vault/);
  assert.match(preview, /Access\/Admin\/Credentials/);
  assert.match(preview, /<mark>privileged<\/mark>/);
  assert.match(preview,/&lt;script&gt;/);
  assert.doesNotMatch(preview,/<script>/);
  const reference = JSON.parse(vm.runInContext('JSON.stringify(evidenceReference(file))',context));
  assert.equal(reference.knowledgeDetails, undefined);
  assert.equal(reference.policyDetails, undefined);
  context.file.policyDetails[0].content = 'Password policy: ' + 'x '.repeat(200) + 'rotate PRIVILEGED credentials immediately';
  const both = vm.runInContext('evidenceMatchPreview(file, query)',context);
  assert.match(both, /Konten policy/);
  assert.match(both, /Konten Knowledge Vault/);
  assert.match(both, /<mark>PRIVILEGED<\/mark>/);
  assert.doesNotMatch(both, /Password policy/);
});
