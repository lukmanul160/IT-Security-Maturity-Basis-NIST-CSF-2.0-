const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const access = require('../src/services/evidenceAccessService');
const { pool } = require('../src/config/database');
test('evidence path validation rejects traversal and absolute paths', () => {
  assert.equal(access.normalize('upload/Govern/Policy/test.pdf'),'Govern/Policy/test.pdf');
  for (const value of ['../test.pdf','upload/../test.pdf','/etc/passwd','C:\\test.pdf',null]) assert.throws(()=>access.normalize(value));
});
test('uploader isolation across upload, file routes, assessment and framework references', {skip:process.env.RUN_EVIDENCE_DB_TESTS!=='1'}, async t => {
  const client=await pool.connect(); const directory=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-owner-')); let server;
  try {
    await client.query('CREATE TEMP TABLE app_users(id BIGINT PRIMARY KEY,username TEXT UNIQUE)');
    await client.query("INSERT INTO app_users VALUES(1,'alice'),(2,'bob'),(3,'admin')");
    await client.query('CREATE TEMP TABLE evidence_files(path TEXT PRIMARY KEY,name TEXT,content BYTEA,mime_type TEXT,updated_at TIMESTAMPTZ DEFAULT NOW())');
    await client.query(await fs.readFile(path.join(__dirname,'../database/evidence-ownership.sql'),'utf8'));
    await client.query(await fs.readFile(path.join(__dirname,'../database/evidence-ownership.sql'),'utf8'));
    await client.query('CREATE TEMP TABLE file_storage_settings(id INTEGER PRIMARY KEY,mode TEXT,directory TEXT,updated_at TIMESTAMPTZ DEFAULT NOW())');
    await client.query('CREATE TEMP TABLE file_storage_locations(path TEXT PRIMARY KEY,root TEXT,object_key TEXT,updated_at TIMESTAMPTZ DEFAULT NOW())');
    await client.query('CREATE TEMP TABLE assessment_state(id TEXT PRIMARY KEY,data JSONB,updated_at TIMESTAMPTZ DEFAULT NOW())');
    await client.query('CREATE TEMP TABLE controls(framework_id TEXT,code TEXT,evidence JSONB)');
    const db={query:client.query.bind(client),connect:async()=>({query:client.query.bind(client),release(){}})};
    t.mock.method(pool,'query',db.query);t.mock.method(pool,'connect',db.connect);
    const storage=require('../src/services/storageService');
    const isolated=storage.createStorageService({db,localRoot:directory,applicationRoot:directory});
    for(const name of ['put','read','exists','remove'])t.mock.method(storage,name,isolated[name]);
    const files=require('../src/services/fileService');
    const alice={username:'alice',role:'user'},bob={username:'bob',role:'user'},admin={username:'admin',role:'admin'};
    async function upload(user,content){const temp=path.join(directory,Math.random()+'.pdf');await fs.writeFile(temp,content);return files.saveFile({functionName:'Govern',kind:'policy',uploadedBy:await access.userId(user),rejectDuplicate:true,file:{path:temp,originalname:'same.pdf',mimetype:'application/pdf',size:content.length}});}
    const a=await upload(alice,'%PDF Alice'),b=await upload(bob,'%PDF Bob');
    assert.notEqual(a.path,b.path,'same filename for different users must not reuse another owner file');
    const aSecond=await upload(alice,'%PDF Alice second');
    assert.notEqual(a.path,aSecond.path,'same filename for the same user must receive a unique identifier');
    await client.query("INSERT INTO evidence_files(path,name,mime_type) VALUES('Govern/Policy/legacy.pdf','legacy.pdf','application/pdf')");
    assert.deepEqual(new Set((await access.list(alice)).map(f=>f.path)),new Set([a.path,aSecond.path]));
    assert.deepEqual((await access.list(bob)).map(f=>f.path),[b.path]);
    assert.equal((await access.list(admin)).length,4);
    await assert.rejects(access.assertAccess(b.path,alice),{status:403});
    await access.assertReadAccess(b.path,alice);
    await assert.rejects(access.assertAccess('upload/Govern/Policy/legacy.pdf',alice),{status:403});
    await access.assertAccess(b.path,admin);
    await files.replaceFile(a.path.replace('upload/',''),{buffer:Buffer.from('%PDF Updated'),originalname:'new.pdf',mimetype:'application/pdf',size:12});
    assert.equal(String((await client.query('SELECT uploaded_by FROM evidence_files WHERE path=$1',[access.normalize(a.path)])).rows[0].uploaded_by),'1','replacement preserves original uploader');
    await assert.rejects(access.assertReferences([{path:b.path}],[],alice),{status:403});
    await access.assertReferences([{path:b.path}],[{path:b.path}],alice); // preserve existing shared references, but cannot select them elsewhere
    await access.assertReferences([{path:b.path}],[],admin);
    await assert.rejects(access.assertReferences({},[],alice),{status:400});
    const assessment=require('../src/controllers/assessmentController');
    const response={json(){},status(){return this;}};
    await client.query('INSERT INTO assessment_state VALUES($1,$2,NOW())',['default',{attachments:{existing:[{path:b.path}]}}]);
    await assert.rejects(assessment.update({user:alice,body:{attachments:{new:[{path:b.path}]}}},response),{status:403});
    await assessment.update({user:alice,body:{attachments:{existing:[{path:b.path}],new:[{path:a.path}]}}},response);
    const frameworks=require('../src/controllers/frameworkController');
    await client.query("INSERT INTO controls VALUES('iso27001','4.1','[]')");
    await assert.rejects(frameworks.updateControlEvidence({user:alice,params:{frameworkId:'iso27001',code:'4.1'},body:{evidence:[{path:b.path}]}},response),{status:403});
    const permission=require('../src/services/permissionService');t.mock.method(permission,'has',async(_role,_page,action)=>action==='create');
    const express=require('express');const app=express();app.use(express.json());
    app.use((req,res,next)=>{req.user=req.get('x-test-user')==='admin'?admin:alice;next();});
    app.use('/files',require('../src/routes/fileRoutes'));
    app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
    assert.equal((await fetch(base+'/files/'+access.normalize(b.path))).status,200,'GET permits another authenticated user to open evidence');
    assert.equal((await (await fetch(base+'/files/access/'+access.normalize(b.path))).json()).canModify,false,'another user cannot modify the evidence');
    for(const method of ['PUT','DELETE'])assert.equal((await fetch(base+'/files/'+access.normalize(b.path),{method})).status,403,method+' blocks other owner');
    const replacement=new FormData();replacement.set('file',new Blob(['%PDF Replacement'],{type:'application/pdf'}),'same.pdf');assert.equal((await fetch(base+'/files/'+access.normalize(a.path),{method:'PUT',body:replacement})).status,200,'a regular user can replace their own file without Files update permission');
    assert.equal((await fetch(base+'/files/'+access.normalize(b.path),{headers:{'x-test-user':'admin'}})).status,200);
    assert.equal((await (await fetch(base+'/files/access/'+access.normalize(b.path),{headers:{'x-test-user':'admin'}})).json()).canModify,true,'admin can modify all evidence');
    assert.equal((await fetch(base+'/files?details=true')).status,403,'the file-library list still requires the Files read permission');
    const form=new FormData();form.set('functionName','Govern');form.set('kind','policy');form.set('uploadedBy','2');form.set('file',new Blob(['%PDF New'],{type:'application/pdf'}),'new.pdf');
    const uploaded=await fetch(base+'/files',{method:'POST',body:form});assert.equal(uploaded.status,201);
    const item=await uploaded.json();assert.equal(String((await client.query('SELECT uploaded_by FROM evidence_files WHERE path=$1',[access.normalize(item.path)])).rows[0].uploaded_by),'1','body cannot spoof uploader');assert.equal((await fetch(base+'/files/'+access.normalize(item.path),{method:'DELETE'})).status,204,'a regular user can delete their own file without Files delete permission');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await client.query('DROP TABLE IF EXISTS pg_temp.controls, pg_temp.assessment_state, pg_temp.file_storage_locations, pg_temp.file_storage_settings, pg_temp.evidence_files, pg_temp.app_users');
    client.release();await pool.end();
    // Directory is created above by mkdtemp, always below the OS temporary root.
    await fs.rm(directory,{recursive:true,force:true});
  }
});
