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
    for(const framework of ['csf','privacy','iso27001','ikas']) {
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2027,sourceYear:2026,mode:'duplicate'})).status,201);
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2028,sourceYear:2027,mode:'new'})).status,201);
      assert.equal((await request('/assessment-periods/'+framework,'POST',{year:2027,sourceYear:2026,mode:'duplicate'})).status,409);
    }
    assert.deepEqual((await request('/assessment?assessmentYear=2027')).body,state);
    const ikasControl=(await request('/ikas?assessmentYear=2027')).body[0];
    assert.equal((await request('/ikas?assessmentYear=2027')).body.length,181);
    assert.equal(ikasControl.ikas.rubric.length,6);
    const ikasAssessment={...service.prepareSnapshot({assessment:{},controls:{ikas:[]},targets:{ikas:[]},gaps:{ikas:[]},objectives:[]},'new',2027,'').assessment,scores:{[ikasControl.id]:0},practiceScores:{[ikasControl.id]:0},respondent:{D4:'IKAS Test',D13:'2027'}};
    assert.equal((await request('/ikas/assessment?assessmentYear=2027','PUT',ikasAssessment)).status,200);
    assert.deepEqual((await request('/ikas/assessment?assessmentYear=2026')).body.scores,{});
    assert.equal((await request('/ikas/assessment?assessmentYear=2027')).body.scores[ikasControl.id],0);
    const exportedIkas=await fetch(base+'/ikas-workbook?assessmentYear=2027',{headers:{cookie:auth.sessionCookie+'='+token}});
    assert.equal(exportedIkas.status,200);assert.match(exportedIkas.headers.get('content-disposition'),/2027.xlsx/);
    const XLSX=require('xlsx'),book=XLSX.read(Buffer.from(await exportedIkas.arrayBuffer()),{type:'buffer'});
    book.Sheets['I Identifikasi'].D5={t:'n',v:4};
    book.Sheets.Responden.D15={t:'n',v:2};
    const importBody=new FormData();importBody.append('file',new Blob([XLSX.write(book,{type:'buffer',bookType:'xlsx'})]),'ikas-test.xlsx');
    const importResponse=await fetch(base+'/ikas-workbook?assessmentYear=2028',{method:'POST',headers:{cookie:auth.sessionCookie+'='+token},body:importBody});
    assert.equal(importResponse.status,200);assert.equal((await request('/ikas/assessment?assessmentYear=2028')).body.scores[ikasControl.id],4);
    assert.equal((await request('/ikas/assessment?assessmentYear=2028')).body.respondent.D13,'2028');
    assert.equal((await request('/frameworks/ikas/targets?assessmentYear=2028')).body[0].targetScore,2);
    const protectedDomainState=(await request('/ikas/assessment?assessmentYear=2028')).body;
    protectedDomainState.scores['IKAS-2.1.1-a']=5;
    assert.equal((await request('/ikas/assessment?assessmentYear=2028','PUT',protectedDomainState)).status,200);
    book.Sheets['I Identifikasi'].D5={t:'n',v:2};book.Sheets['II Proteksi'].D5={t:'n',v:1};
    const domainBody=new FormData();domainBody.append('file',new Blob([XLSX.write(book,{type:'buffer',bookType:'xlsx'})]),'ikas-domain.xlsx');domainBody.append('domains',JSON.stringify(['IDENTIFIKASI']));
    const domainResponse=await fetch(base+'/ikas-workbook?assessmentYear=2028',{method:'POST',headers:{cookie:auth.sessionCookie+'='+token},body:domainBody});assert.equal(domainResponse.status,200);
    const domainResult=(await request('/ikas/assessment?assessmentYear=2028')).body;
    assert.equal(domainResult.scores[ikasControl.id],2);assert.equal(domainResult.scores['IKAS-2.1.1-a'],5);
    const updatedWorkbook=await fetch(base+'/ikas-workbook?assessmentYear=2028',{headers:{cookie:auth.sessionCookie+'='+token}});assert.equal(updatedWorkbook.status,200);
    const updatedBook=XLSX.read(Buffer.from(await updatedWorkbook.arrayBuffer()),{type:'buffer'});assert.equal(updatedBook.Sheets['II Proteksi'].D5.v,5);assert.equal(updatedBook.Sheets['I Identifikasi'].D5.v,2);
    assert.equal((await request('/ikas/assessment?assessmentYear=2027')).body.scores[ikasControl.id],0);
    assert.equal((await fetch(base+'/ikas-workbook?assessmentYear=2028',{method:'POST',headers:{cookie:auth.sessionCookie+'='+viewer},body:importBody})).status,403);
    assert.equal((await request('/ikas/assessment?assessmentYear=2027','PUT',{...ikasAssessment,scores:{[ikasControl.id]:2.5}})).status,400);
    assert.equal((await request('/ikas/assessment?assessmentYear=2027','PUT',{...ikasAssessment,respondent:{D15:'invalid'}})).status,400);
    assert.equal((await request('/ikas/assessment?assessmentYear=2027','PUT',ikasAssessment,viewer)).status,403);
    assert.equal((await request('/ikas/'+ikasControl.id+'?assessmentYear=2027','PUT',{ikas:{...ikasControl.ikas,scope:'Updated scope'}})).status,200);
    assert.notEqual((await request('/ikas?assessmentYear=2026')).body[0].ikas.scope,'Updated scope');
    const ikasGap=await request('/assessment-gaps/ikas/'+ikasControl.id+'?assessmentYear=2027','POST',{description:'IKAS gap',status:'Open',evidence:[]});assert.equal(ikasGap.status,201);
    assert.equal((await request('/assessment-gaps/ikas?assessmentYear=2027')).body.length,1);
    assert.equal((await request('/assessment-periods/ikas','POST',{year:2029,sourceYear:2027,mode:'duplicate'})).status,201);
    assert.equal((await request('/ikas/assessment?assessmentYear=2029')).body.respondent.D13,'2029');
    assert.notEqual((await request('/assessment-gaps/ikas?assessmentYear=2029')).body[0].id,ikasGap.body.id);
    assert.equal((await request('/ikas/assessment/reset?assessmentYear=2029','POST')).status,204);
    assert.equal((await request('/ikas/assessment?assessmentYear=2027')).body.scores[ikasControl.id],0);
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
    assert.equal((await request('/assessment-periods/csf/2027','DELETE',undefined,editor)).status,403);
    assert.equal((await request('/assessment-periods/csf/1999','DELETE')).status,400);
    assert.equal((await request('/assessment-periods/csf/2099','DELETE')).status,404);
    assert.equal((await request('/assessment-periods/csf/2028','DELETE')).status,204);
    assert.equal((await request('/assessment?assessmentYear=2028')).status,404);
    assert.equal((await request('/assessment?assessmentYear=2027')).body.notes.one,'2027 reasoning');
    assert.equal((await request('/assessment-periods/csf/2026','DELETE')).status,204);
    assert.equal((await request('/assessment')).status,404);
    assert.equal((await request('/assessment-periods/csf/2027','DELETE')).status,409);
    // Startup migration must never resurrect a deleted legacy year.
    await scoped.query(await require('node:fs/promises').readFile(require('node:path').join(__dirname,'../database/assessment-periods.sql'),'utf8'));
    assert.deepEqual((await request('/assessment-periods/csf')).body.map(row=>row.year),[2027]);
    assert.equal((await request('/assessment-periods/csf','POST',{year:2026,sourceYear:2027,mode:'new'})).status,201);
    assert.deepEqual((await request('/assessment')).body.notes,{});
    assert.equal((await request('/assessment-periods/csf/2026','DELETE')).status,204);
    assert.equal((await scoped.query('SELECT COUNT(*)::int AS count FROM evidence_files')).rows[0].count,1);
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
    for(const framework of ['privacy','iso27001']) {
      assert.equal((await request('/assessment-periods/'+framework+'/2027','DELETE')).status,204);
      assert.equal((await request('/assessment-periods/'+framework+'/2027','DELETE')).status,404);
      assert.deepEqual((await request('/assessment-periods/'+framework)).body.map(row=>row.year),[2028,2026]);
    }
    assert.equal((await request('/frameworks/iso27001-soa/controls?assessmentYear=2027')).status,404);
    assert.equal((await request('/frameworks/iso27001-soa/controls?assessmentYear=2026')).body[0].notes,'Original note');
  } finally {
    tokens.forEach(token=>auth.destroySession(token));
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(scoped)await scoped.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);admin.release();await pool.end();
  }
});
