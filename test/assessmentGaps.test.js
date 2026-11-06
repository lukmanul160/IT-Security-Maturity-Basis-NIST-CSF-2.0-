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
  t.mock.method(require('../src/services/assessmentPeriodService'),'ensureStore',async()=>{});
  t.mock.method(require('../src/services/assessmentPeriodService'),'periodMetadata',async()=>({legacy:true}));
  t.mock.method(require('../src/services/websiteSettingsService'),'read',async()=>({}));
  t.mock.method(pool,'query',async()=>({rows:[],rowCount:1}));
  t.mock.method(require('pg').Pool.prototype,'connect',async()=>({query:async()=>({rows:[{acquired:true}]}),release(){}}));
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
    assert.equal((await fetch(base+'/csf/export.xlsx',{headers})).status,200);
    t.mock.method(require('../src/services/assessmentPeriodService'),'periodMetadata',async()=>({legacy:false}));
    t.mock.method(require('../src/services/assessmentPeriodService'),'execute',async()=>[{description:'Gap tahun 2027',evidence:[]}]);
    const annual=await fetch(base+'/csf/export.xlsx?assessmentYear=2027',{headers});
    assert.equal(annual.status,200);assert.match(annual.headers.get('content-disposition'),/2027/);
    t.mock.method(require('../src/services/assessmentPeriodService'),'periodMetadata',async()=>({legacy:true}));
    for(const [method,url] of [['POST','/csf/DE.AE-02'],['PUT','/csf/DE.AE-02/id'],['DELETE','/csf/DE.AE-02/id'],['GET','/privacy']])assert.equal((await fetch(base+url,{method,headers})).status,403);
    assert.equal((await fetch(base+'/unknown',{headers})).status,404);
  }finally{auth.destroySession(token);server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('gap save locks number allocation before reading used numbers and rejects duplicate manual values',async t=>{
 const calls=[],writes=[];
 t.mock.method(pool,'query',async()=>({rows:[]}));
 t.mock.method(access,'assertReferences',async()=>{});
 t.mock.method(pool,'connect',async()=>({query:async(sql,args)=>{
   calls.push(sql);
   if(sql.startsWith('SELECT 1'))return {rowCount:1,rows:[{function:'RESPOND (RS): Description',subcategory:'RS.CO-2: Communication'}]};
   if(sql.startsWith('SELECT id,details'))return {rows:[{id:'old',details:{gapNumber:'G-RS.CO-2-PR-01'}}]};
   if(sql.startsWith('INSERT')){writes.push(args);return {rows:[{details:JSON.parse(args[7])}]};}
   return {rows:[]};
 },release(){}}));
 const base={description:'Gap',status:'Open',evidence:[],details:{decisionNote:'Comply',dimension:'Process',gapNumberMode:'auto'}};
 const row=await service.save('csf','RS-CO-2',null,base,{});
 assert.equal(row.details.gapNumber,'G-RS.CO-2-PR-02');
 assert.ok(calls.findIndex(sql=>sql.includes('pg_advisory_xact_lock'))<calls.findIndex(sql=>sql.startsWith('SELECT id,details')));
 await assert.rejects(service.save('csf','RS-CO-2',null,{...base,details:{...base.details,gapNumberMode:'manual',gapNumber:'g-rs.co-2-pr-01'}},{}),{status:409});
 assert.equal(writes.length,1);assert.equal(calls.at(-1),'ROLLBACK');
});
