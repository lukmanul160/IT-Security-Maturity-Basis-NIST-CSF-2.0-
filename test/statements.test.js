const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/statementService');
const payload = () => ({status:'Tetap',nama:'Penguji',nip:'333',jabatan:'Staf',penyedia:'',tempat:'Jakarta',tanggal:'2026-10-17',consent:true,signature:[[[0.1,0.2],[0.3,0.4],[0.5,0.2]]]});
test('public submission validates identity, consent, calendar date and actual signature strokes',()=>{
  assert.equal(service.normalizeSubmission(payload()).nip,'333');
  for(const change of [{nama:''},{nip:'333 444'},{status:'Lainnya'},{status:'Outsource'},{tanggal:'2026-02-30'},{consent:false},{signature:[]},{signature:[[[0,0],[0,0]]]},{signature:[[[0,0],[2,0]]]},{signature:'<svg/>'}]) assert.throws(()=>service.normalizeSubmission({...payload(),...change}),{status:400});
  assert.equal(service.normalizeSubmission({...payload(),status:'Outsource',penyedia:'Mitra'}).penyedia,'Mitra');
});
test('templates allow supported placeholders and substitute literal field values',()=>{
  assert.equal(service.normalizeType({title:'Surat',body:'Nama {{nama}}',active:true}).title,'Surat');
  assert.throws(()=>service.normalizeType({title:'Surat',body:'{{unknown}}',active:true}),{status:400});
  assert.equal(service.render('Nama {{nama}} NIP {{nip}} Penyedia {{penyedia}}',{...payload(),nama:'$& {{nip}}'}),'Nama $& {{nip}} NIP 333 Penyedia -');
});
test('submission checks revision and active template, stores a snapshot, and detects concurrent template edits',async t=>{
  const {pool}=require('../src/config/database');
  const original=pool.query;
  t.after(()=>{pool.query=original;});
  const type={id:'22222222-2222-4222-8222-222222222222',title:'Kode Etik',body:'Saya {{nama}}, NIP {{nip}}',revision:2};
  let insert;
  pool.query=async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:[type]};insert=args;return {rows:[{id:args[0]}]};};
  await assert.rejects(()=>service.submit(type.id,{...payload(),revision:1}),{status:409});
  await service.submit(type.id,{...payload(),revision:2});
  assert.equal(insert[4].body,'Saya Penguji, NIP 333');
  assert.match(insert[4].sha256,/^[a-f0-9]{64}$/);
  type.body='Berubah';assert.equal(insert[4].body,'Saya Penguji, NIP 333');
  pool.query=async sql=>({rows:sql.startsWith('SELECT')?[type]:[]});
  await assert.rejects(()=>service.submit(type.id,{...payload(),revision:2}),{status:409});
  pool.query=async()=>({rows:[]});
  await assert.rejects(()=>service.submit(type.id,{...payload(),revision:2}),{status:404});
});

test('uploaded signatures are bounded decoded PNGs and exclude ambiguous or blank input',()=>{
 const documents=require('../src/services/statementDocumentService');
 const image='data:image/png;base64,'+documents.png(payload().signature).toString('base64');
 const value=service.normalizeSubmission({...payload(),signature:undefined,signatureImage:image});assert.ok(value.signatureImage.startsWith('data:image/png;base64,'));assert.equal(value.signature,undefined);
 for(const signatureImage of ['data:image/svg+xml;base64,PHN2Zz4=',image+'!', 'data:image/png;base64,'+documents.png().toString('base64')])assert.throws(()=>service.normalizeSubmission({...payload(),signature:undefined,signatureImage}),{status:400});
 assert.throws(()=>service.normalizeSubmission({...payload(),signatureImage:image}),{status:400});
 const malicious=Buffer.from(documents.png());malicious.writeUInt32BE(100000,16);assert.throws(()=>service.normalizeSubmission({...payload(),signature:undefined,signatureImage:'data:image/png;base64,'+malicious.toString('base64')}),{status:400});
});
