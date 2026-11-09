const test = require('node:test'), assert = require('node:assert/strict'), XLSX = require('xlsx');
require('dotenv').config = () => ({ parsed: {} });
const { defaults } = require('../src/services/securityChecklistService');
const workbook = import('../frontend/client/src/services/securityChecklistWorkbook.mjs');
const draft = () => ({ title: 'Audit akses', columns: structuredClone(defaults), rows: [{ id: 'r1', values: { id: '001', area: '=HYPERLINK("https://example.com")', status: 'Sesuai', evidence: 'Dokumen\nBaris 2' } }] });
const bytes = book => XLSX.write(book, { type: 'array', bookType: 'xlsx' });
test('Excel round-trip retains custom order, phases, options, text IDs and multiline evidence', async () => {
  const { writeChecklistWorkbook, readChecklistWorkbook } = await workbook;
  const data = draft(); data.columns.unshift({ id: 'priority', label: 'Prioritas', type: 'select', phase: 'assessment', options: ['Tinggi', 'Rendah'] });
  data.rows[0].values.priority = 'Tinggi';
  const buffer = writeChecklistWorkbook(data), result = readChecklistWorkbook(buffer, defaults);
  assert.equal(result.title, data.title); assert.deepEqual(result.columns, data.columns);
  for (const c of data.columns) assert.equal(result.rows[0].values[c.id], data.rows[0].values[c.id] || '');
  const book = XLSX.read(buffer, { type: 'array' });
  assert.equal(book.Sheets.Checklist.C2.t, 's'); assert.equal(book.Sheets.Checklist.C2.f, undefined);
});
test('ordinary Excel headers support custom columns and status vocabulary', async () => {
  const { readChecklistWorkbook } = await workbook;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['ID', 'Area', 'Status', 'Risk'], ['001', 'Server', 'Pass', 'Low']]), 'Sheet1');
  const result = readChecklistWorkbook(bytes(book), defaults);
  assert.equal(result.rows[0].values.id, '001'); assert.equal(result.columns[2].phase, 'assessment');
  assert.ok(result.columns[2].options.includes('Pass')); assert.equal(result.columns[3].label, 'Risk');
});
test('Excel rejects formulas, changed metadata headers, excessive dimensions and invalid options', async () => {
  const { writeChecklistWorkbook, readChecklistWorkbook } = await workbook;
  const source = writeChecklistWorkbook(draft());
  const book = XLSX.read(source, { type: 'array' });
  book.Sheets.Checklist.A2 = { t: 'n', f: '1+1', v: 2 };
  assert.throws(() => readChecklistWorkbook(bytes(book), defaults), /Formula/);
  const changed = XLSX.read(source, { type: 'array' }); changed.Sheets.Checklist.A1.v = 'Changed';
  assert.throws(() => readChecklistWorkbook(bytes(changed), defaults), /Header berubah/);
  const large = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(large, XLSX.utils.aoa_to_sheet([['ID'], ...Array.from({ length: 501 }, () => ['x'])]), 'Checklist');
  assert.throws(() => readChecklistWorkbook(bytes(large), defaults), /melebihi batas/);
  const bad = draft(); bad.rows[0].values.status = 'Unknown'; assert.throws(() => writeChecklistWorkbook(bad), /pilihan/);
  assert.throws(() => readChecklistWorkbook(new ArrayBuffer(5 * 1024 * 1024 + 1), defaults), /5 MB/);
});
test('large custom option schemas fit Excel cells and empty template imports', async () => {
  const { writeChecklistWorkbook, readChecklistWorkbook } = await workbook;
  const columns = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + i, label: 'Column ' + i, type: 'select', phase: 'assessment', options: Array.from({ length: 30 }, (_, j) => String(j).padEnd(99, 'x')) }));
  const result = readChecklistWorkbook(writeChecklistWorkbook({ title: 'Template', columns, rows: [] }), defaults);
  assert.equal(result.columns.length, 30); assert.equal(result.rows.length, 0);
});


test('Excel archive limits reject declared expansion bombs and verify actual deflate sizes',async()=>{
 const {inspectChecklistArchive,verifyChecklistArchive}=await import('../frontend/client/src/services/securityChecklistArchive.mjs');
 const {writeChecklistWorkbook}=await workbook;
 const safe=new Uint8Array(writeChecklistWorkbook(draft()));await verifyChecklistArchive(safe);
 const bomb=safe.slice(),view=new DataView(bomb.buffer);
 let cursor=0;for(;cursor<bomb.length-46;cursor++)if(view.getUint32(cursor,true)===0x02014b50)break;
 view.setUint32(cursor+24,26*1024*1024,true);assert.throws(()=>inspectChecklistArchive(bomb),/dekompresi/);
 const mismatch=safe.slice(),mismatchView=new DataView(mismatch.buffer);mismatchView.setUint32(cursor+24,1,true);
 await assert.rejects(verifyChecklistArchive(mismatch),/dekompresi/);
 assert.throws(()=>inspectChecklistArchive(new Uint8Array([1,2,3])),/Arsip/);
});
