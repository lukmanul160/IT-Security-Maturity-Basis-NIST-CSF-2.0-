const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pool } = require('../src/config/database');
const service = require('../src/services/policyRegisterService');

test('policy relations survive create, partial update, reload and explicit removal', async () => {
  const original = pool.query;
  let row;
  pool.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO policy_register (')) {
      row = { id: '1', title: params[0], related_note_ids: JSON.parse(params[10]) };
      return { rows: [row] };
    }
    if (sql.startsWith('SELECT * FROM policy_register')) return { rows: [row] };
    if (sql.startsWith('UPDATE policy_register')) {
      row = { ...row, title: params[0], related_note_ids: JSON.parse(params[11]) };
      return { rows: [row] };
    }
    if (sql.startsWith('SELECT id, title, category')) return { rows: [row] };
    return { rows: [] };
  };
  try {
    const policy = { title: 'Kebijakan umum', category: 'Security', owner: 'CISO', reviewCycle: 'Annual', approvalStatus: 'Draft', relatedNoteIds: [2, '2', '3'] };
    assert.deepEqual((await service.create(policy)).relatedNoteIds, ['2', '3']);
    assert.deepEqual((await service.update('1', { title: 'Updated' })).relatedNoteIds, ['2', '3']);
    assert.deepEqual((await service.list())[0].relatedNoteIds, ['2', '3']);
    assert.deepEqual((await service.update('1', { relatedNoteIds: [] })).relatedNoteIds, []);
    for (const invalid of [null, {}, ['-1'], ['1 OR 1=1'], Array(10001).fill(1)]) {
      await assert.rejects(service.update('1', { relatedNoteIds: invalid }), { status: 400 });
    }
  } finally { pool.query = original; }
});

test('policy search includes only linked note content and combines with category filters', () => {
  const inputs = {
    policyRegisterSearch: { value: 'hak akses' },
    policyRegisterCategoryFilter: { value: 'Security' },
    policyRegisterStatusFilter: { value: 'all' },
    policyRegisterOwnerFilter: { value: 'all' },
  };
  for (const id of ['pdCategory', 'pdOwner', 'pdStatus', 'pdReview']) inputs[id] = { value: '', selectedOptions: [{textContent: 'Semua'}] };
  inputs.pdDrillStatus = {}; inputs.pdClearDrill = {};
  const tr = { dataset: { policyId: '1' }, style: {}, querySelectorAll: () => ['Kebijakan umum', 'Security', 'CISO', 'Annual', 'Draft', '', '', ''].map(textContent => ({ textContent })) };
  inputs.policyRegisterBody = { querySelectorAll: () => [tr] };
  for (const input of Object.values(inputs)) input.addEventListener = () => {};
  const context = vm.createContext({ $: id => inputs[id] || null, document: { querySelectorAll: () => [] } });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/policy-register/form.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/policy-register/register-and-calendar.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/governance-dashboard.js', 'utf8'), context);
  const dashboard = fs.readFileSync('frontend/client/src/workspace/features/policy-register/dashboard.js', 'utf8');
  vm.runInContext(dashboard.slice(0, dashboard.indexOf("$('policyRegisterView').addEventListener")), context);
  vm.runInContext(`policyKnowledgeNotes = [{id:2,title:'Akses',folder:'Security',content:'Aturan hak akses'}, {id:3,title:'Other',content:'rahasia unik'}]; policyRegisterRows = [{id:1,title:'Kebijakan umum',category:'Security',owner:'CISO',approvalStatus:'Draft',relatedNoteIds:['2']}]; filterPolicyRegisterTable();`, context);
  assert.equal(tr.style.display, '');
  inputs.policyRegisterCategoryFilter.value = 'Privacy';
  vm.runInContext('filterPolicyRegisterTable()', context);
  assert.equal(tr.style.display, 'none');
  inputs.policyRegisterCategoryFilter.value = 'all';
  inputs.policyRegisterSearch.value = 'rahasia unik';
  vm.runInContext('filterPolicyRegisterTable()', context);
  assert.equal(tr.style.display, 'none');
  vm.runInContext('policyKnowledgeNotes = []; filterPolicyRegisterTable()', context);
  assert.equal(tr.style.display, 'none');
});

test('folder selection includes descendants and hidden search results, excluding similarly named folders', () => {
  const context = vm.createContext({ $: () => null });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/policy-register/form.js', 'utf8'), context);
  vm.runInContext(`policyKnowledgeNotes = [
    {id:1,folder:'Security',title:'Policy'},
    {id:2,folder:'Security/Access',title:'Accounts'},
    {id:3,folder:'Security/Access/Admin',title:'Password'},
    {id:4,folder:'Security Archive',title:'Archive'},
    {id:5,folder:'',title:'Root'}
  ]; setPolicyRelatedFolder('Security', true);`, context);
  const selection = () => JSON.parse(vm.runInContext('JSON.stringify([...policyRelatedSelection].sort())', context));
  assert.deepEqual(selection(), ['1', '2', '3']);
  vm.runInContext("setPolicyRelatedFolder('Security/Access', false)", context);
  assert.deepEqual(selection(), ['1']);
  vm.runInContext("setPolicyRelatedFolder('', true)", context);
  assert.deepEqual(selection(), ['1', '2', '3', '4', '5']);
  vm.runInContext("setPolicyRelatedFolder('', false)", context);
  assert.deepEqual(selection(), []);
});
