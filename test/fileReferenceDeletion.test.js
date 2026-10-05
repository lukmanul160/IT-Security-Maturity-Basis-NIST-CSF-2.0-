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
