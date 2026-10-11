const test = require('node:test');
const assert = require('node:assert/strict');
const files = require('../src/services/personnelCertificateFileService');
const service = require('../src/services/personnelCertificationService');
const storage = require('../src/services/storageService');
const access = require('../src/services/evidenceAccessService');
const { pool } = require('../src/config/database');
const pdf = { originalname:'CISSP.pdf', mimetype:'application/pdf', buffer:Buffer.from('%PDF-1.7\ncertificate\n%%EOF') };
test('certificate uploads validate formats, size and signatures', () => {
  assert.equal(files.validate(pdf),'application/pdf');
  for (const file of [{...pdf,buffer:Buffer.from('<html>')},{...pdf,originalname:'certificate.html'},{...pdf,buffer:Buffer.alloc(5*1024*1024+1)},{...pdf,mimetype:'text/html'}]) assert.throws(()=>files.validate(file),{status:400});
});
test('certificate registration saves original bytes and server-owned attachment metadata', async t => {
  t.mock.method(access,'userId',async()=>17);
  let uploaded;
  t.mock.method(storage,'put',async(path, file)=>{uploaded=path;assert.deepEqual(file.buffer,pdf.buffer);assert.equal(file.uploadedBy,17);});
  t.mock.method(service,'create',async data=>{assert.equal(data.certificateFile.path,`upload/${uploaded}`);assert.equal(data.certificateFile.name,'CISSP.pdf');return data;});
  const result = await files.saveRequest({is:()=>true,body:{data:JSON.stringify({personnelId:1,certificationName:'CISSP',certificateFile:{path:'someone-else.pdf'}})},file:pdf,user:{}},null);
  assert.equal(result.certificateFile.size,pdf.buffer.length);
});
test('failed certification save cleans the newly staged file', async t => {
  t.mock.method(access,'userId',async()=>17);
  t.mock.method(storage,'put',async()=>{});
  let removed, deleted;
  t.mock.method(storage,'remove',async p=>{removed=p;});
  t.mock.method(pool,'query',async(sql,params)=>{deleted=params[0];return {rows:[]};});
  t.mock.method(service,'update',async()=>{throw Object.assign(new Error('Certification not found'),{status:404});});
  await assert.rejects(files.saveRequest({is:()=>true,body:{data:JSON.stringify({personnelId:1,certificationName:'CISSP'})},file:pdf,user:{}},99),{status:404});
  assert.ok(removed.startsWith('Personnel Certification/Certificates/'));
  assert.equal(removed,deleted);
});
test('ordinary edits preserve certificates and explicit removal clears the link', async t => {
  t.mock.method(service,'update',async(id,data)=>data);
  const ordinary=await files.saveRequest({is:()=>false,body:{personnelId:1,certificationName:'CISSP',certificateFile:{path:'forged'}}},1);
  assert.equal(Object.hasOwn(ordinary,'certificateFile'),false);
  const removed=await files.saveRequest({is:()=>true,body:{data:'{"personnelId":1,"certificationName":"CISSP"}',removeCertificate:'true'}},1);
  assert.equal(removed.certificateFile,null);
});
