const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/budgetService');
const owner = { username: 'requester', role: 'editor' }, approver = { username: 'chief', role: 'approver' };
const draft = () => ({ year: 2027, status: 'draft', amount: 100, actual: 0, requesterId: owner.username, history: [] });
test('budget follows approval and realization workflow without changing its year', () => {
  let record = draft();
  for (const [status,user] of [['submitted',owner],['reviewed',approver],['approved',approver],['realizing',owner],['completed',owner]]) record = service.advance(record,{status,actual:90},user);
  assert.equal(record.year,2027); assert.equal(record.actual,90); assert.equal(record.history.length,5); assert.equal(record.history[0].actorId,'requester');
});
test('budget rejects skipped approval, self approval and unauthorized reviewers', () => {
  assert.throws(()=>service.advance(draft(),{status:'approved'},approver),{status:409});
  const submitted = {...draft(),status:'submitted'};
  assert.throws(()=>service.advance(submitted,{status:'reviewed'},owner),{status:403});
  assert.throws(()=>service.advance(submitted,{status:'reviewed'},{...owner,role:'admin'}),{status:403});
  assert.throws(()=>service.advance(draft(),{status:'submitted'},approver),{status:403});
});
test('rejection requires a reason and resubmission starts at draft', () => {
  const record = {...draft(),status:'reviewed'};
  assert.throws(()=>service.advance(record,{status:'rejected'},approver),/Alasan/);
  const rejected=service.advance(record,{status:'rejected',note:'Perbaiki rincian'},approver);
  assert.equal(service.advance(rejected,{status:'draft'},owner).status,'draft');
});
test('years and amounts are validated; realization cannot exceed approval', () => {
  assert.equal(service.year('2028'),2028);
  for(const y of [1999,2201,'x',2026.5]) assert.throws(()=>service.year(y));
  for(const n of [-1,Infinity,'',null,1e13,1.123]) assert.throws(()=>service.amount(n));
  assert.throws(()=>service.advance({...draft(),status:'realizing'},{status:'completed',actual:101},owner),/melebihi/);
});
test('annual lists are partitioned and duplicate years are rejected', async () => {
  const {pool}=require('../src/config/database');
  const original=pool.query;
  const calls=[];
  pool.query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT year FROM budget_years ORDER'))return {rows:[{year:2027},{year:2026}]};if(sql.startsWith('SELECT data'))return {rows:[{data:{year:args[0],title:'Budget '+args[0]}}]};return {rowCount:0,rows:[]};};
  try {
    assert.equal((await service.list(2026)).requests[0].year,2026);
    assert.equal((await service.list(2027)).requests[0].year,2027);
    assert.deepEqual(calls.filter(c=>c.sql.startsWith('SELECT data')).map(c=>c.args),[[2026],[2027]]);
    await assert.rejects(service.createYear(2026),{status:409});
  } finally {pool.query=original;}
});
test('only the assigned user may approve, including users without global approver role',()=>{
  const record={...draft(),status:'reviewed',approver:'finance'};
  assert.throws(()=>service.advance(record,{status:'approved'},approver),{status:403});
  assert.throws(()=>service.advance(record,{status:'approved'},{username:'other-admin',role:'admin'}),{status:403});
  assert.equal(service.advance(record,{status:'approved'},{username:'finance',role:'editor'}).status,'approved');
});
test('Excel round trip accepts draft fields and rejects bad headers, rows and formulas',()=>{
  const excel=require('../src/services/budgetWorkbook'),XLSX=require('xlsx');
  const record={title:'Server',department:'IT',type:'CAPEX',amount:2500000,purpose:'Pengadaan',year:2027,requester:'alice',status:'approved',actual:2000000};
  assert.deepEqual(excel.parse(excel.workbook([record])),[service.fields(record)]);
  assert.throws(()=>excel.parse(excel.workbook([],true)),/Isi 1/);
  assert.throws(()=>excel.parse(Buffer.from('invalid')),/tidak valid/);
  const book=XLSX.read(excel.workbook([record]),{type:'buffer'});
  book.Sheets.Anggaran.D2={t:'n',v:2,f:'1+1'};
  assert.throws(()=>excel.parse(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),/Rumus/);
});
test('submission captures configured approver and rejects missing configuration',async()=>{
  const {pool}=require('../src/config/database'),permissions=require('../src/services/permissionService');
  const originalConnect=pool.connect,originalHas=permissions.has;let assigned={approver:'finance',role:'editor'},saved;
  pool.connect=async()=>({release(){},async query(sql,args){if(sql.startsWith('SELECT data'))return {rows:[{data:draft()}],rowCount:1};if(sql.startsWith('SELECT a.approver'))return {rows:assigned?[assigned]:[]};if(sql.startsWith('UPDATE budget_requests'))saved=args[1];return {rows:[],rowCount:1};}});
  permissions.has=async()=>true;
  try{const record=await service.update('00000000-0000-0000-0000-000000000001',{status:'submitted'},owner);assert.equal(record.approver,'finance');assert.equal(saved.status,'submitted');assigned=null;await assert.rejects(service.update('00000000-0000-0000-0000-000000000001',{status:'submitted'},owner),/menetapkan approver/);}finally{pool.connect=originalConnect;permissions.has=originalHas;}
});
test('Excel import validates every row before writing and rolls back write failures',async()=>{
  const excel=require('../src/services/budgetWorkbook'),{pool}=require('../src/config/database'),original=pool.connect;
  const records=[{title:'Server',department:'IT',type:'CAPEX',amount:100,purpose:'Pengadaan'},{title:'Cloud',department:'IT',type:'OPEX',amount:50,purpose:'Operasional'}];
  const commands=[];let written=0;
  pool.connect=async()=>({release(){},async query(sql){commands.push(sql);if(sql.startsWith('SELECT year'))return {rowCount:1};if(sql.startsWith('INSERT')&&++written===2)throw Error('write failed');return {rowCount:1};}});
  try{await assert.rejects(excel.importWorkbook(excel.workbook(records),2027,owner),/write failed/);assert.ok(commands.includes('ROLLBACK'));assert.ok(!commands.includes('COMMIT'));}finally{pool.connect=original;}
});
