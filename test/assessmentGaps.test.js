const test=require('node:test');
const assert=require('node:assert/strict');
const service=require('../src/services/assessmentGapService');
const {pool}=require('../src/config/database');
const access=require('../src/services/evidenceAccessService');

test('gap validation requires description and Open/Closed, allowing evidence to be added later',()=>{
  assert.deepEqual(service.validate({description:'  Kurang poin a  ',status:'Open',evidence:[]}),{description:'Kurang poin a',status:'Open',evidence:[]});
  for(const value of [{description:' ',status:'Open',evidence:[]},{description:'a',status:'Pending',evidence:[]},{description:'a',status:'Closed',evidence:[{}]},{description:'a'.repeat(4001),status:'Open',evidence:[]}])assert.throws(()=>service.validate(value),{status:400});
  assert.deepEqual(service.summary([{controlCode:'A',status:'Open',evidence:[]},{controlCode:'A',status:'Closed',evidence:[{path:'upload/a'}]},{controlCode:'B',status:'Open',evidence:[]}]),{total:3,open:2,closed:1,withoutEvidence:2,affectedControls:2});
});
test('gap saves create distinct IDs for multiple findings on the same assessment',async t=>{
  const writes=[];
  t.mock.method(pool,'query',async()=>({rows:[]}));
  const client={query:async(sql,args)=>{if(sql.startsWith('SELECT 1'))return {rowCount:1};if(sql.startsWith('INSERT')){writes.push(args);return {rows:[{id:args[0],controlCode:args[2]}]};}return {rows:[]};},release(){}};
  t.mock.method(pool,'connect',async()=>client);
  t.mock.method(access,'assertReferences',async()=>{});
  const a=await service.save('csf','DE.AE-02',null,{description:'Kurang poin a',status:'Open',evidence:[]},{username:'manager'});
  const b=await service.save('csf','DE.AE-02',null,{description:'Kurang poin b',status:'Closed',evidence:[]},{username:'manager'});
  assert.notEqual(a.id,b.id);assert.equal(writes[0][2],writes[1][2]);assert.equal(writes[0][6],'manager');
});
test('gap update rejects stale edits and cross-control IDs before linking evidence',async t=>{
  let commits=0,rollbacks=0,found=true,checked=0;
  t.mock.method(pool,'connect',async()=>({query:async sql=>{
    if(sql.includes('SELECT *'))return {rows:found?[{updated_at:new Date('2026-10-10T00:00:00Z'),evidence:[]}]:[]};
    if(sql.startsWith('SELECT 1'))return {rowCount:1};if(sql==='COMMIT')commits++;if(sql==='ROLLBACK')rollbacks++;return {rows:[]};
  },release(){}}));
  t.mock.method(access,'assertReferences',async()=>{checked++;});
  await assert.rejects(service.save('privacy','ID.IM-P1','id',{description:'a',status:'Open',evidence:[],updatedAt:'old'},{}),{status:409});
  found=false;
  await assert.rejects(service.save('privacy','other-control','id',{description:'a',status:'Open',evidence:[]},{}),{status:404});
  assert.equal(commits,0);assert.equal(rollbacks,2);assert.equal(checked,0);
});
test('evidence ownership rejection rolls back gap writes',async t=>{
  const calls=[];
  t.mock.method(pool,'connect',async()=>({query:async(sql)=>{calls.push(sql);return sql.startsWith('SELECT 1')?{rowCount:1}:{rows:[]};},release(){}}));
  t.mock.method(access,'assertReferences',async()=>{throw Object.assign(Error('Uploader access denied'),{status:403});});
  await assert.rejects(service.save('iso27001','4.1',null,{description:'a',status:'Open',evidence:[{path:'upload/other/file.pdf'}]},{}),{status:403});
  assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(sql=>sql.startsWith('INSERT')));
});
test('gap endpoints enforce assessment read/update/delete permissions and reject unknown frameworks',async t=>{
  const permissions=require('../src/services/permissionService');
  const auth=require('../src/config/auth');
  t.mock.method(permissions,'has',async(role,key,action)=>role==='viewer'&&key==='assessment'&&action==='read');
  t.mock.method(service,'list',async()=>[]);
  const token=auth.createSession({username:'gap-test-viewer',role:'viewer'});
  const server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {
    const base='http://127.0.0.1:'+server.address().port+'/api/assessment-gaps';
    const headers={cookie:auth.sessionCookie+'='+token,'Content-Type':'application/json'};
    const read=await fetch(base+'/csf',{headers});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');
    for(const [method,url] of [['POST','/csf/DE.AE-02'],['PUT','/csf/DE.AE-02/id'],['DELETE','/csf/DE.AE-02/id'],['GET','/privacy']])assert.equal((await fetch(base+url,{method,headers})).status,403);
    assert.equal((await fetch(base+'/unknown',{headers})).status,404);
  }finally{auth.destroySession(token);server.closeAllConnections();await new Promise(r=>server.close(r));}
});
