const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { pool } = require('../src/config/database');
const service = require('../src/services/assessmentPeriodService');
const { describe } = require('../src/middleware/assessmentYear');

test('assessment year validation and route scopes reject invalid years and preserve permission boundaries', () => {
  assert.equal(service.validateYear('2027'),2027);
  for(const year of [1999,2101,'2027junk',null,[],['2026','2027']])assert.throws(()=>service.validateYear(year),{status:400});
  assert.equal(describe('/privacy/assessment','PUT').permission,'privacy-assessment');
  assert.equal(describe('/frameworks/iso27001-soa/controls/A.5.1/evidence','PUT').owner,'iso27001');
  assert.equal(describe('/assessment-gaps/csf/import','POST').action,'update');
  assert.equal(describe('/assessment/reset','POST').action,'delete');
  assert.equal(describe('/files/test.pdf','DELETE'),null);
});

test('yearly assessments copy all results, start empty, isolate mutations, and preserve evidence references', async t => {
  const admin = await pool.connect(), schema = 'assessment_period_test_' + crypto.randomBytes(6).toString('hex');
  let scoped, server;
  const auth = require('../src/config/auth'), tokens=[];
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    scoped = new Pool({...pool.options,password:pool.options.password,options:`-c search_path=${schema}`,max:6});
    await scoped.query(`
      CREATE TABLE controls(framework_id TEXT,code TEXT,function TEXT,category TEXT,subcategory TEXT,implementation TEXT,"references" TEXT,minimum_evidence TEXT,notes TEXT,evidence JSONB,applicability TEXT,PRIMARY KEY(framework_id,code));
      CREATE TABLE framework_category_targets(framework_id TEXT,category TEXT,target_score NUMERIC,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(framework_id,category));
      CREATE TABLE assessment_state(id TEXT PRIMARY KEY,data JSONB,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE evidence_files(path TEXT PRIMARY KEY,name TEXT,mime_type TEXT,uploaded_by INT);
      CREATE TABLE app_users(id INT,username TEXT);
      CREATE TABLE information_security_objectives(id INT,objective_year INT,objective TEXT,indicator TEXT,baseline TEXT,target_value TEXT,owner TEXT,evaluation_frequency TEXT,period_targets JSONB,monthly_status TEXT,quarterly_status TEXT,semester_status TEXT,annual_status TEXT,notes TEXT);
      INSERT INTO app_users VALUES(1,'period-admin'),(2,'period-editor');
      INSERT INTO evidence_files VALUES('test/evidence.pdf','evidence.pdf','application/pdf',1);
    `);
    t.mock.method(pool,'query',scoped.query.bind(scoped));
    t.mock.method(pool,'connect',scoped.connect.bind(scoped));
    await service.ensureStore();await require('../src/services/assessmentGapService').ensureStore();
    const file={path:'upload/test/evidence.pdf',name:'evidence.pdf',type:'application/pdf'};
    const state={scores:{one:4},policyScores:{one:3},practiceScores:{one:4},notes:{one:'Original reasoning'},attachments:{one:[file]},targetScores:{Category:4}};
    for(const framework of ['csf','privacy','iso27001','iso27001-soa']) {
      await scoped.query('INSERT INTO controls VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[framework,framework==='iso27001'?'4.1':framework==='iso27001-soa'?'A.5.1':'one','Function','Category','Control one','Checklist','Reference','Minimum evidence','Original note',JSON.stringify([file]),'Not applicable']);
      await scoped.query('INSERT INTO framework_category_targets(framework_id,category,target_score) VALUES($1,$2,$3)',[framework,'Category',4]);
      await scoped.query(`INSERT INTO assessment_gaps(id,framework_id,control_code,description,status,evidence) VALUES($1,$2,$4,'Original gap','Closed',$3)`,[crypto.randomUUID(),framework,JSON.stringify([file]),framework==='iso27001'?'4.1':framework==='iso27001-soa'?'A.5.1':'one']);
    }
    for(const id of ['default','privacy'])await scoped.query('INSERT INTO assessment_state(id,data) VALUES($1,$2)',[id,state]);
    await scoped.query(`INSERT INTO information_security_objectives VALUES(1,2026,'Original objective','','','90%','IT','annual','{}','On track','On track','On track','Achieved','Original objective note')`);
    t.mock.method(require('../src/services/permissionService'),'has',async(role,key,action)=>role==='admin'||role==='editor'&&action!=='delete'||role==='viewer'&&action==='read');
    const express=require('express'),app=express();app.use(express.json());
    app.use('/api',require('../src/middleware/auth').requireAuth,require('../src/routes'));
    app.use(require('../src/middleware/errorHandler').errorHandler);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const token=auth.createSession({username:'period-admin',role:'admin'}),viewer=auth.createSession({username:'period-viewer',role:'viewer'}),editor=auth.createSession({username:'period-editor',role:'editor'});tokens.push(token,viewer,editor);
    const request=async(url,method='GET',body,session=token)=>{
      const response=await fetch(base+url,{method,headers:{cookie:auth.sessionCookie+'='+session,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:response.status===204?null:await response.json()};
    };
    const initial=await request('/assessment-periods/csf');assert.equal(initial.status,200);assert.equal(initial.body[0].year,2026);
    for(const framework of ['csf','privacy','iso27001']) {
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2027,sourceYear:2026,mode:'duplicate'})).status,201);
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2028,sourceYear:2027,mode:'new'})).status,201);
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2027,sourceYear:2026,mode:'duplicate'})).status,409);
    }
    assert.deepEqual((await request('/assessment?assessmentYear=2027')).body,state);
    assert.deepEqual((await request('/privacy/assessment?assessmentYear=2027')).body,state);
    assert.deepEqual((await request('/assessment?assessmentYear=2028')).body,service.prepareSnapshot({assessment:state,controls:{csf:[]},targets:{csf:[]},gaps:{csf:[]},objectives:[]},'new',2028,'test').assessment);
    const sourceGap=(await request('/assessment-gaps/csf?assessmentYear=2026')).body[0],copiedGap=(await request('/assessment-gaps/csf?assessmentYear=2027')).body[0];
    assert.notEqual(sourceGap.id,copiedGap.id);assert.equal(copiedGap.status,'Closed');assert.deepEqual(copiedGap.evidence,[file]);
    assert.deepEqual((await request('/assessment-gaps/csf?assessmentYear=2028')).body,[]);
    const emptyControl=(await request('/csf?assessmentYear=2028')).body[0];assert.equal(emptyControl.notes,'');assert.deepEqual(emptyControl.evidence,[]);
    assert.equal((await request('/frameworks/csf/targets?assessmentYear=2028')).body[0].targetScore,3);
    assert.equal((await request('/frameworks/iso27001/objectives?assessmentYear=2027')).body[0].year,2027);
    const updated={...state,practiceScores:{one:2},notes:{one:'2027 reasoning'}};
    assert.equal((await request('/assessment?assessmentYear=2027','PUT',updated)).status,200);
    assert.deepEqual((await request('/assessment?assessmentYear=2026')).body,state);
    assert.equal((await request('/assessment-gaps/csf/one/'+copiedGap.id+'?assessmentYear=2027','PUT',{description:'2027 gap',status:'Open',evidence:[file],updatedAt:copiedGap.updatedAt})).status,200);
    assert.equal((await request('/assessment-gaps/csf/one/'+copiedGap.id+'?assessmentYear=2027','PUT',{description:'Stale',status:'Open',evidence:[file],updatedAt:copiedGap.updatedAt})).status,409);
    assert.equal((await request('/assessment-gaps/csf?assessmentYear=2026')).body[0].description,'Original gap');
    assert.equal((await request('/frameworks/iso27001-soa/controls/A.5.1?assessmentYear=2027','PUT',{notes:'2027 SOA',applicability:'Applicable'})).status,200);
    assert.equal((await request('/frameworks/iso27001-soa/controls?assessmentYear=2026')).body[0].notes,'Original note');
    assert.equal((await request('/frameworks/iso27001-soa/controls?assessmentYear=2027')).body[0].notes,'2027 SOA');
    // Concurrent independent edits in one annual snapshot must both survive.
    const concurrent=await Promise.all([
      request('/csf/one?assessmentYear=2027','PUT',{notes:'Concurrent control note'}),
      request('/frameworks/csf/targets/Category?assessmentYear=2027','PUT',{targetScore:5})
    ]);assert.ok(concurrent.every(result=>result.status===200));
    assert.equal((await request('/csf?assessmentYear=2027')).body[0].notes,'Concurrent control note');
    assert.equal((await request('/frameworks/csf/targets?assessmentYear=2027')).body[0].targetScore,5);
    assert.equal((await request('/assessment?assessmentYear=2027','PUT',updated,viewer)).status,403);
    assert.equal((await request('/assessment-periods/csf','POST',{year:2029,sourceYear:2027,mode:'duplicate'},viewer)).status,403);
    assert.equal((await request('/assessment?assessmentYear=2027','PUT',{...updated,attachments:{}},editor)).status,403);
    assert.equal((await request('/assessment?assessmentYear=1999')).status,400);
    assert.equal((await request('/assessment?assessmentYear=2099')).status,404);
    assert.equal((await request('/assessment-periods/csf','POST',{year:2030,sourceYear:2099,mode:'duplicate'})).status,404);
    assert.equal((await request('/assessment-periods/csf','POST',{year:2030,sourceYear:2026,mode:'bad'})).status,400);
    assert.equal((await request('/assessment/reset?assessmentYear=2028','POST')).status,204);
    assert.equal((await request('/assessment?assessmentYear=2027')).body.notes.one,'2027 reasoning');
    assert.equal(await service.fileReferenceCount('test/evidence.pdf'),3);
    const client=await scoped.connect();
    try {
      await client.query('BEGIN');await service.detachFile(client,'test/evidence.pdf');await client.query('ROLLBACK');
      assert.equal(await service.fileReferenceCount('test/evidence.pdf'),3);
      await client.query('BEGIN');await service.detachFile(client,'test/evidence.pdf');await client.query('COMMIT');
    } finally {client.release();}
    assert.equal(await service.fileReferenceCount('test/evidence.pdf'),0);
    assert.deepEqual((await request('/assessment?assessmentYear=2027')).body.attachments.one,[]);
    assert.deepEqual((await request('/frameworks/iso27001-soa/controls?assessmentYear=2027')).body[0].evidence,[]);
    assert.deepEqual((await request('/assessment-gaps/privacy?assessmentYear=2027')).body[0].evidence,[]);
    assert.equal((await request('/assessment?assessmentYear=2027')).body.notes.one,'2027 reasoning');
  } finally {
    tokens.forEach(token=>auth.destroySession(token));
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(scoped)await scoped.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);admin.release();await pool.end();
  }
});
