const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/client/src/workspace/features/policy-register/register-and-calendar.js', 'utf8');

test('DOCX editing is available across statuses and opens above a policy form as a modal', async () => {
  let allowed = true, modal = false, mounted = false;
  const elements = [];
  const context = vm.createContext({
    canManagePolicyRegister: () => allowed,
    document: { createElement(tag) { const el = { tag, setAttribute() {}, append() {}, addEventListener() {}, showModal() { modal = true; }, remove() {}, close() {} }; elements.push(el); return el; }, body: { append() {} } },
    window: { addEventListener() {}, removeEventListener() {}, NistStatementEditor: async () => ({ mount: async () => { mounted = true; return { destroy() {} }; } }) },
    workspaceUserReady: Promise.resolve({}),
    fetch: async () => ({ ok: true, headers: { get: () => 'revision' }, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  vm.runInContext(source.slice(source.indexOf('function canEditPolicyDocument'), source.indexOf('function getPolicyNextReviewDate')), context);
  for (const approvalStatus of ['Draft', 'Approved', 'Review due']) {
    assert.equal(context.canEditPolicyDocument({ attachmentPath: 'policy/file.docx', attachmentName: 'File.DOCX ', approvalStatus }), true);
  }
  assert.equal(context.canEditPolicyDocument({ attachmentPath: 'file.doc', attachmentName: 'file.doc' }), false);
  allowed = false;
  assert.equal(context.canEditPolicyDocument({ attachmentPath: 'file.docx', attachmentName: 'file.docx' }), false);
  allowed = true;
  await context.openPolicyDocumentEditor({ id: 1, title: 'Policy', attachmentName: 'file.docx' });
  assert.equal(modal, true);
  assert.equal(mounted, true);
  assert.equal(elements.find(el => el.textContent === 'Simpan dokumen').disabled, false);
});
