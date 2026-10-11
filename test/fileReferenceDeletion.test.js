const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');
const service = require('../src/services/fileService');
const storage = require('../src/services/storageService');

test('main file deletion detaches every source, preserves other files and rolls back on storage failure', async t => {
  const client = await pool.connect();
  try {
    for (const sql of [
      'CREATE TEMP TABLE assessment_state(id TEXT PRIMARY KEY,data JSONB,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE assessment_gaps(id TEXT PRIMARY KEY,description TEXT,status TEXT,evidence JSONB,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE controls(id TEXT PRIMARY KEY,evidence JSONB,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE policy_register(id INT PRIMARY KEY,attachment_path TEXT,attachment_name TEXT,attachment_type TEXT,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE tprm_due_diligence_questionnaires(id INT PRIMARY KEY,responses JSONB,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE audit_finding_records(id TEXT PRIMARY KEY,data JSONB,filename TEXT,content BYTEA,updated_at TIMESTAMPTZ)',
      'CREATE TEMP TABLE evidence_files(path TEXT PRIMARY KEY)'
    ]) await client.query(sql);
    const target='folder/main.pdf', keep={path:'upload/folder/keep.pdf',name:'keep.pdf'};
    await client.query('INSERT INTO evidence_files VALUES($1)',[target]);
    await client.query('INSERT INTO assessment_state VALUES($1,$2,NOW())',['test',{scores:{one:3},attachments:{one:[{path:target},keep],two:[{path:'uploads/'+target}]}}]);
    await client.query('INSERT INTO controls VALUES($1,$2,NOW())',['test',JSON.stringify([{path:'upload/'+target},keep])]);
    await client.query('INSERT INTO assessment_gaps VALUES($1,$2,$3,$4,NOW())',['gap-test','Kurang poin a','Open',JSON.stringify([{path:'upload/'+target},keep])]);
    await client.query("INSERT INTO policy_register VALUES(1,$1,'main.pdf','application/pdf',NOW())",[target]);
    await client.query('INSERT INTO tprm_due_diligence_questionnaires VALUES(1,$1,NOW())',[{answer:'yes',vendorDocuments:[{path:target},keep]}]);
    await client.query('INSERT INTO audit_finding_records VALUES($1,$2,$3,$4,NOW())',['one',{title:'Audit evidence',attachmentPath:target,attachments:[{path:target},keep]},'main.pdf',Buffer.from('legacy')]);
    await client.query('INSERT INTO audit_finding_records VALUES($1,$2,$3,$4,NOW())',['legacy',{title:'Legacy evidence',attachmentPath:target},'main.pdf',Buffer.from('legacy')]);
    t.mock.method(pool,'connect',async()=>({query:client.query.bind(client),release(){}}));
    t.mock.method(storage,'remove',async()=>{throw new Error('Storage unavailable');});
    await assert.rejects(service.deleteFile(target,{library:true}),/Storage unavailable/);
    assert.equal((await client.query('SELECT attachment_path FROM policy_register')).rows[0].attachment_path,target);
    assert.equal((await client.query('SELECT * FROM evidence_files')).rowCount,1);
    t.mock.method(storage,'remove',async(path)=>assert.equal(path,target));
    await service.deleteFile(target,{library:true});
    const assessment=(await client.query('SELECT data FROM assessment_state')).rows[0].data;
    assert.deepEqual(assessment,{scores:{one:3},attachments:{one:[keep],two:[]}});
    assert.deepEqual((await client.query('SELECT evidence FROM controls')).rows[0].evidence,[keep]);
    assert.deepEqual((await client.query('SELECT description,status,evidence FROM assessment_gaps')).rows[0],{description:'Kurang poin a',status:'Open',evidence:[keep]});
    assert.equal((await client.query('SELECT attachment_path FROM policy_register')).rows[0].attachment_path,'');
    assert.deepEqual((await client.query('SELECT responses FROM tprm_due_diligence_questionnaires')).rows[0].responses,{answer:'yes',vendorDocuments:[keep]});
    const audit=(await client.query('SELECT * FROM audit_finding_records ORDER BY id')).rows;
    assert.deepEqual(audit[0].data,{title:'Legacy evidence',attachments:[]});
    assert.equal(audit[0].filename,null);
    assert.equal(audit[0].content,null);
    assert.deepEqual(audit[1].data,{title:'Audit evidence',attachmentPath:keep.path,attachments:[keep]});
    assert.equal(audit[1].filename,'keep.pdf');
    assert.equal((await client.query('SELECT * FROM evidence_files')).rowCount,0);
  } finally { client.release(); await pool.end(); }
});
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('original-file deletion requires explicit confirmation before deleting all references', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/client/src/workspace/features/uploaded-files/attachments.js'), 'utf8');
  const fragment = source.slice(source.indexOf('async function deleteUploadedLibraryFile('), source.indexOf('\nfunction ', source.indexOf('async function deleteUploadedLibraryFile(')));
  const requests = [], messages = [];
  let approved = false;
  const record = {path:'folder/main.pdf', name:'main.pdf'};
  const context = vm.createContext({
    uploadedFileRecordMap: new Map([['one',record]]), canEditUploadedFile:()=>true,
    confirm:message=>{messages.push(message);return approved;},
    $:()=>({textContent:''}), apiFileUrl:value=>'/api/files/'+value,
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true};},
    evidenceLibrary:[], evidenceLibraryError:"", state:{attachments:{}}, privacyState:{attachments:{}}, iso27001Rows:[], iso27001SoaRows:[], policyRegisterRows:[],
    refreshEvidenceLibrary:async()=>{}
  });
  vm.runInContext(fragment,context);
  await context.deleteUploadedLibraryFile('one');
  assert.equal(requests.length,0);
  assert.match(messages[0],/file asli\/induk/);
  assert.match(messages[0],/seluruh referensinya/);
  approved=true;
  await context.deleteUploadedLibraryFile('one');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'/api/files/folder/main.pdf?library=true');
  assert.equal(requests[0].options.method,'DELETE');
});

test('ISO reference deletion preserves the original file and other references and respects cancellation',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../frontend/client/src/workspace/features/iso27001/controls-and-evidence.js'),'utf8');
  const fragment=source.split('\n').find(line=>line.startsWith('async function deleteIsoListEvidence('));
  const original={path:'main.pdf',name:'main.pdf'}, other={path:'other.pdf',name:'other.pdf'};
  const row={id:'one',evidence:[original,other]}, calls=[];
  let approved=false;
  const context=vm.createContext({iso27001Rows:[row],iso27001SoaRows:[],confirm:message=>{assert.match(message,/File asli\/induk.*tetap tersedia/);return approved;},updateIsoEvidence:async(...args)=>{calls.push(args);return {ok:true};},renderIso27001Manager(){},renderIso27001SoaManager(){}});
  vm.runInContext(fragment,context);
  const button={dataset:{listEvidenceDelete:'clauses|one',evidenceIndex:'0'}};
  await context.deleteIsoListEvidence(button);
  assert.equal(calls.length,0);
  assert.equal(row.evidence.length,2);
  approved=true;
  await context.deleteIsoListEvidence(button);
  assert.equal(calls.length,1);
  assert.equal(row.evidence.length,1);
  assert.equal(row.evidence[0],other);
});

test('failed evidence refresh keeps known files and exposes the actual HTTP error',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../frontend/client/src/workspace/features/uploaded-files/evidence-library.js'),'utf8');
  const fragment=source.slice(source.indexOf('async function refreshEvidenceLibrary('),source.indexOf('\ndocument.addEventListener(',source.indexOf('async function refreshEvidenceLibrary(')));
  const known={path:'upload/policy-register/main.pdf',name:'main.pdf'},elements=new Map();
  const context=vm.createContext({evidenceLibrary:[known],evidenceLibraryPending:null,evidenceLibraryError:'',fetch:async()=>({ok:false,status:500,json:async()=>({error:'Database unavailable'})}),$:id=>{if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);},document:{querySelectorAll:()=>[]},renderUploadedFiles(){}});
  vm.runInContext(fragment,context);
  await context.refreshEvidenceLibrary();
  assert.equal(context.evidenceLibrary[0],known);
  assert.match(context.evidenceLibraryError,/HTTP 500.*Database unavailable/);
  assert.match(elements.get('uploadedFilesStatus').textContent,/Database unavailable/);
});

test('refresh after deletion waits for an earlier list request and fetches fresh data',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../frontend/client/src/workspace/features/uploaded-files/evidence-library.js'),'utf8');
  const fragment=source.slice(source.indexOf('async function refreshEvidenceLibrary('),source.indexOf('\ndocument.addEventListener(',source.indexOf('async function refreshEvidenceLibrary(')));
  let complete,calls=0;
  const previous=new Promise(resolve=>{complete=resolve;});
  const context=vm.createContext({evidenceLibrary:[],evidenceLibraryPending:null,evidenceLibraryError:'',fetch:async()=>{calls++;return calls===1?previous:{ok:true,json:async()=>[]};},$:()=>({textContent:''}),document:{querySelectorAll:()=>[]},renderUploadedFiles(){}});
  vm.runInContext(fragment,context);
  const pending=context.refreshEvidenceLibrary();
  const fresh=context.refreshEvidenceLibrary({force:true});
  assert.equal(calls,1);
  complete({ok:true,json:async()=>[{path:'upload/deleted.pdf',name:'deleted.pdf'}]});
  await Promise.all([pending,fresh]);
  assert.equal(calls,2);
  assert.equal(context.evidenceLibrary.length,0);
});
