const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const codec = import('../frontend/client/src/services/moduleProgressWorkbook.mjs');
const payload = () => ({ format:'nist-basis-module',version:1,module:'policy-register',exportedAt:'2026-10-14',data:{register:[{id:7,title:'Kebijakan',status:'In progress',score:0,active:false,notes:'Baris 1\nBaris 2',items:[{id:8,done:true}],reference:'@json:literal',empty:null}],empty:[]} });
const edit = (bytes, fn) => { const book=XLSX.read(bytes,{type:'array'});fn(book);return XLSX.write(book,{type:'array',bookType:'xlsx'}); };
test('Excel preserves progress, relationships, zero, booleans, multiline notes and empty sections',async()=>{
  const {writeProgressWorkbook,readProgressWorkbook}=await codec;
  const source=payload();assert.deepEqual(readProgressWorkbook(writeProgressWorkbook(source),'policy-register'),source);
});
test('import reads edited cells rather than an embedded original snapshot',async()=>{
  const {writeProgressWorkbook,readProgressWorkbook}=await codec;
  const bytes=edit(writeProgressWorkbook(payload()),book=>{book.Sheets.register.C2.v='Closed';book.Sheets.register.D2.v=5;});
  const result=readProgressWorkbook(bytes,'policy-register');assert.equal(result.data.register[0].status,'Closed');assert.equal(result.data.register[0].score,5);
});
test('wrong module, missing sheet, changed headers and formulas are rejected before writes',async()=>{
  const {writeProgressWorkbook,readProgressWorkbook}=await codec;const bytes=writeProgressWorkbook(payload());
  assert.throws(()=>readProgressWorkbook(bytes,'personnel'),/modul lain/);
  assert.throws(()=>readProgressWorkbook(edit(bytes,book=>delete book.Sheets.register)),/wajib tersedia/);
  assert.throws(()=>readProgressWorkbook(edit(bytes,book=>{book.Sheets.register.A1.v='changed';})),/Header/);
  assert.throws(()=>readProgressWorkbook(edit(bytes,book=>{book.Sheets.register.D2.f='1+1';})),/Formula/);
});
test('templates produce usable empty sheets with complete fields',async()=>{
  const {writeProgressWorkbook,readProgressWorkbook}=await codec;
  const source={format:'nist-basis-module',version:1,module:'personnel',data:{personnel:[],certifications:[]}};
  const bytes=writeProgressWorkbook(source,{personnel:{id:'ID',personnelName:'Nama'},certifications:{personnelId:'Pegawai',status:'Status'}});
  assert.deepEqual(readProgressWorkbook(bytes,'personnel'),source);
});
test('asset envelope and reminder configuration survive Excel round trip',async()=>{
  const {writeProgressWorkbook,readProgressWorkbook}=await codec;
  const source={format:'nist-basis-asset-management',version:1,data:{assets:[{id:'asset',riskRegisterIds:['CSR-001']}],racks:[],placements:[],relations:[],nodes:[],photos:[],reminderTemplate:{subjectTemplate:'Renewal',bodyTemplate:'Reminder'}}};
  assert.deepEqual(readProgressWorkbook(writeProgressWorkbook(source)),source);
});
test('oversized cell data fails explicitly instead of silently truncating progress',async()=>{
  const {writeProgressWorkbook}=await codec;const source=payload();source.data.register[0].notes='x'.repeat(32768);
  assert.throws(()=>writeProgressWorkbook(source),/32.767/);
});
