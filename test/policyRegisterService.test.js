const test = require('node:test');
const assert = require('node:assert/strict');

const { pool } = require('../src/config/database');
const originalQuery = pool.query.bind(pool);

function restore() {
  pool.query = originalQuery;
  delete require.cache[require.resolve('../src/services/policyRegisterService')];
}

test('policy register service supports CRUD and attachment metadata', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    if (typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS policy_register')) {
      return { rows: [] };
    }
    if (typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS policy_register_dropdown_options')) {
      return { rows: [] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT COUNT(*)::int AS count FROM policy_register_dropdown_options')) {
      return { rows: [{ count: 0 }] };
    }
    if (typeof sql === 'string' && sql.includes('INSERT INTO policy_register_dropdown_options')) {
      return { rows: [], rowCount: 1 };
    }
    if (typeof sql === 'string' && sql.includes('SELECT id, title')) {
      return { rows: [{ id: 1, title: 'Information Security Policy', category: 'Cybersecurity', owner: 'CISO', review_cycle: 'Annual', approval_status: 'Approved', last_review: '2026-08-15', attachment_name: 'security-policy.pdf', attachment_path: 'uploads/policy/security-policy.pdf', attachment_type: 'application/pdf', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] };
    }
    if (typeof sql === 'string' && sql.includes('INSERT INTO policy_register')) {
      return { rows: [{ id: 1, title: params[0], category: params[1], owner: params[2], review_cycle: params[3], approval_status: params[4], last_review: params[5], attachment_name: params[6], attachment_path: params[7], attachment_type: params[8] }] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT * FROM policy_register WHERE id = $1')) {
      return { rowCount: 1, rows: [{ id: 1, title: 'Information Security Policy', category: 'Cybersecurity', owner: 'CISO', review_cycle: 'Annual', approval_status: 'Approved', last_review: '2026-08-15', attachment_name: 'security-policy.pdf', attachment_path: 'uploads/policy/security-policy.pdf', attachment_type: 'application/pdf', notes: '', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }] };
    }
    if (typeof sql === 'string' && sql.includes('UPDATE policy_register')) {
      return { rowCount: 1, rows: [{ id: 1, title: params[0], category: params[1], owner: params[2], review_cycle: params[3], approval_status: params[4], last_review: params[5], attachment_name: params[6], attachment_path: params[7], attachment_type: params[8], notes: params[9] }] };
    }
    if (typeof sql === 'string' && sql.includes('SELECT attachment_path FROM policy_register WHERE id = $1')) {
      return { rowCount: 1, rows: [{ attachment_path: 'uploads/policy/security-policy.pdf' }] };
    }
    if (typeof sql === 'string' && sql.includes('DELETE FROM policy_register')) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const service = require('../src/services/policyRegisterService');

  await assert.doesNotReject(() => service.ensureStore());
  const list = await service.list();
  assert.equal(Array.isArray(list), true);
  const created = await service.create({
    title: 'Information Security Policy',
    category: 'Cybersecurity',
    owner: 'CISO',
    reviewCycle: 'Annual',
    approvalStatus: 'Approved',
    lastReview: '2026-08-15',
    attachmentName: 'security-policy.pdf',
    attachmentPath: 'uploads/policy/security-policy.pdf',
    attachmentType: 'application/pdf',
    items: [
      { subtitle: 'Purpose', content: 'Defines the security policy purpose.' },
      { subtitle: 'Scope', content: 'Applies to all information assets.' },
    ]
  });
  assert.equal(created.title, 'Information Security Policy');
  assert.deepEqual(created.items, [
    { subtitle: 'Purpose', content: 'Defines the security policy purpose.' },
    { subtitle: 'Scope', content: 'Applies to all information assets.' },
  ]);
  assert.equal(calls.filter(call => call.sql.includes('INSERT INTO policy_register_items')).length, 2);

  const updated = await service.update(1, { title: 'Updated Policy', approvalStatus: 'Review due' });
  assert.equal(updated.title, 'Updated Policy');

  await assert.doesNotReject(() => service.remove(1));
  assert.ok(calls.length >= 4);
  restore();
});

process.on('exit', restore);

test('policy deletion handles missing and other-owner attachments while enforcing Delete',async t=>{
  const client=await pool.connect();let server;
  try {
    await client.query('CREATE TEMP TABLE policy_register(id BIGINT PRIMARY KEY,attachment_path TEXT)');
    await client.query('CREATE TEMP TABLE policy_register_items(id BIGINT,policy_id BIGINT REFERENCES policy_register(id) ON DELETE CASCADE)');
    await client.query('CREATE TEMP TABLE evidence_files(path TEXT PRIMARY KEY,uploaded_by BIGINT)');
    await client.query("INSERT INTO policy_register VALUES(1,'policy-register/missing.pdf'),(2,'policy-register/other-owner.pdf')");
    await client.query('INSERT INTO policy_register_items VALUES(1,1),(2,2)');
    await client.query("INSERT INTO evidence_files VALUES('policy-register/other-owner.pdf',2)");
    t.mock.method(pool,'query',client.query.bind(client));
    let allowed=false;
    t.mock.method(require('../src/services/permissionService'),'has',async(_role,key,action)=>allowed&&key==='policy-register'&&action==='delete');
    const ownership=t.mock.method(require('../src/services/evidenceAccessService'),'assertAccess',async()=>{throw Object.assign(new Error('Missing or other-owner file'),{status:403});});
    const physical=t.mock.method(require('../src/services/storageService'),'remove',async()=>{throw new Error('Policy deletion must not delete the original file');});
    const app=require('express')();app.use((req,res,next)=>{req.user={role:'editor',username:'test'};next();});app.use('/policy',require('../src/routes/policyRegisterRoutes'));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/policy`;
    assert.equal((await fetch(url+'/1',{method:'DELETE'})).status,403);
    assert.equal((await client.query('SELECT * FROM policy_register')).rowCount,2);
    allowed=true;
    for(const id of [1,2])assert.equal((await fetch(url+'/'+id,{method:'DELETE'})).status,204);
    assert.equal((await client.query('SELECT * FROM policy_register')).rowCount,0);
    assert.equal((await client.query('SELECT * FROM policy_register_items')).rowCount,0);
    assert.equal((await client.query('SELECT * FROM evidence_files')).rowCount,1,'original file remains available');
    assert.equal(ownership.mock.callCount(),0);
    assert.equal(physical.mock.callCount(),0);
  }finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await client.query('DROP TABLE IF EXISTS pg_temp.policy_register_items,pg_temp.policy_register,pg_temp.evidence_files');client.release();await pool.end();
  }
});

test('failed policy deletion shows the server error and keeps the dialog open',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync('frontend/client/src/workspace/features/policy-register/register-and-calendar.js','utf8');
  const start=source.indexOf('function setPolicyDeletionStatus('),next=source.indexOf('\nfunction showPolicyRegisterView(',start);
  const end=next<0 ? source.indexOf('\nasync function ',start+1) : next;
  const fragment=source.slice(start,end);
  const dialog={open:true,close(){this.open=false;}},status={textContent:''};
  const context=vm.createContext({policyRegisterRows:[{id:3}],canManagePolicyRegister:()=>true,confirm:()=>true,fetch:async()=>({ok:false,status:403,json:async()=>({error:'Delete permission denied'})}),$:id=>id==='policyRegisterModal'?dialog:status,renderPolicyRegisterRows(){},resetPolicyRegisterForm(){},refreshEvidenceLibrary:async()=>{}});
  vm.runInContext(fragment,context);
  await context.deletePolicyRegister(3);
  assert.equal(status.textContent,'Delete permission denied');
  assert.equal(dialog.open,true);
  assert.equal(context.policyRegisterRows.length,1);
});


test('policy deletion completes even when refreshing files fails, and reports network errors', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync('frontend/client/src/workspace/features/policy-register/register-and-calendar.js', 'utf8');
  const fragment = source.slice(source.indexOf('function setPolicyDeletionStatus('), source.indexOf('function showPolicyRegisterView('));
  const dialog = { open: true, close() { this.open = false; } };
  const status = { textContent: '' };
  let fail = true;
  const context = vm.createContext({ policyRegisterRows: [{ id: 3 }], canManagePolicyRegister: () => true, confirm: () => true,
    fetch: async () => { if (fail) throw new Error('Connection lost'); return { ok: true, status: 204 }; },
    $: id => id === 'policyRegisterModal' ? dialog : status, renderPolicyRegisterRows() {}, resetPolicyRegisterForm() {},
    refreshEvidenceLibrary: async () => { throw new Error('File list unavailable'); } });
  vm.runInContext(fragment, context);
  await context.deletePolicyRegister(3);
  assert.equal(status.textContent, 'Connection lost');
  assert.equal(context.policyRegisterRows.length, 1);
  assert.equal(dialog.open, true);
  fail = false;
  await context.deletePolicyRegister(3);
  assert.equal(context.policyRegisterRows.length, 0);
  assert.equal(dialog.open, false);
  assert.equal(status.textContent, 'Policy dihapus. File asli tetap tersedia.');
});
