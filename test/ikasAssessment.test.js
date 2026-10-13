const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const XLSX=require('xlsx');
const {extract}=require('../scripts/generate-ikas-seed');
const {seed,validateControlMetadata}=require('../src/services/ikasService');
const scoring=require('../src/shared/ikasScoring');
const workbook=require('../src/services/ikasWorkbookService');
const source=()=>XLSX.readFile(path.join(__dirname,'../data/ikas-template.xlsx'));
test('completed IKAS workbook recovers a blank repeated validation header and preserves inputs',()=>{
  const book=source(),sheet=book.Sheets['II Proteksi'];
  delete sheet.K82;
  sheet.D83={t:'n',v:4};sheet.K83={t:'s',v:'Bukti pelaksanaan tetap tersimpan'};
  const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
  const imported=workbook.read(buffer);
  assert.equal(imported.controls.length,181);
  assert.equal(imported.scores['IKAS-2.5.7-a'],4);
  assert.equal(imported.notes['IKAS-2.5.7-a'],'Bukti pelaksanaan tetap tersimpan');
  const exported=workbook.write({controls:{ikas:imported.controls},assessment:{scores:imported.scores,notes:imported.notes},ikasWorkbookTemplate:imported.template});
  const roundTrip=workbook.read(exported);
  assert.equal(roundTrip.scores['IKAS-2.5.7-a'],4);
  assert.equal(roundTrip.notes['IKAS-2.5.7-a'],'Bukti pelaksanaan tetap tersimpan');
  sheet.K82={t:'s',v:'Kolom lain'};
  assert.throws(()=>workbook.parse(book),/Header indeks/);
  delete sheet.K82;delete sheet.C82;
  assert.throws(()=>workbook.parse(book),/Header indeks/);
});
test('IKAS single index preserves historical scores, notes and evidence references',()=>{
  const id='IKAS-1.1.1-a',file={path:'upload/test.pdf',name:'test.pdf'};
  const normalized=scoring.normalize({scores:{[id]:0},practiceScores:{[id]:3},policyScores:{[id]:5},notes:{['practice-'+id]:'Keterangan utama',['policy-'+id]:'Catatan tambahan'},attachments:{['policy-'+id]:[file],['practice-'+id]:[file]},respondent:{D4:'Organisasi'}});
  assert.equal(normalized.scores[id],0);assert.equal(normalized.notes[id],'Keterangan utama\n\nCatatan tambahan');assert.equal(normalized.attachments[id].length,1);
  assert.equal(normalized.policyScores,undefined);assert.equal(normalized.practiceScores,undefined);assert.deepEqual(scoring.normalize(normalized),normalized);
});
test('IKAS seed preserves every source question, scope, rubric and respondent field',()=>{
  assert.deepEqual(extract(source()),seed);
  assert.equal(seed.controls.length,181);assert.equal(new Set(seed.controls.map(row=>row.category)).size,18);
  assert.equal(new Set(seed.controls.map(row=>row.ikas.subcategoryId)).size,90);
  assert.equal(seed.respondentFields.length,15);assert.equal(seed.respondentFields[0].cell,'D4');
  assert.deepEqual(seed.domains.map(row=>row.weight),[.25,.30,.25,.20]);
  for(const row of seed.controls){assert.equal(row.ikas.rubric.length,6);assert.ok(row.ikas.rubric.every(Boolean));}
  assert.throws(()=>validateControlMetadata({...seed.controls[0].ikas,rubric:['only one']}),{status:400});
});
test('IKAS uses subcategory and category averages with domain weights, zero scores and incomplete status',()=>{
  const controls=structuredClone(seed.controls);
  const state={scores:Object.fromEntries(controls.map(row=>[row.id,({IDENTIFIKASI:1,PROTEKSI:2,DETEKSI:3,'PENANGGULANGAN DAN PEMULIHAN':4})[row.function]]))};
  assert.equal(scoring.summarize(controls,state).overall,2.4);
  const zero={scores:Object.fromEntries(controls.map(row=>[row.id,0]))};assert.equal(scoring.summarize(controls,zero).overall,0);
  delete state.scores[controls[0].id];assert.equal(scoring.summarize(controls,state).overall,null);
  controls[0].applicability='Not applicable';assert.equal(scoring.summarize(controls,state).overall,2.4);
  const example=[
    {id:'a',function:'IDENTIFIKASI',category:'one',ikas:{subcategoryId:'1.1.1',weight:.25}},
    {id:'b',function:'IDENTIFIKASI',category:'one',ikas:{subcategoryId:'1.1.1',weight:.25}},
    {id:'c',function:'IDENTIFIKASI',category:'one',ikas:{subcategoryId:'1.1.2',weight:.25}},
    ...seed.domains.slice(1).map((row,index)=>({id:'other'+index,function:row.name,category:'other',ikas:{subcategoryId:'2.1.1',weight:row.weight}}))
  ];
  const result=scoring.summarize(example,{scores:{a:0,b:0,c:5,other0:3,other1:3,other2:3}});
  assert.equal(result.domains[0].score,2.5);assert.equal(result.overall,2.87);
  for(const [score,label]of [[0,'Level 1 - Awal'],[1.5,'Level 1 - Awal'],[1.51,'Level 2 - Berulang'],[2.51,'Level 3 - Terdefinisi'],[3.51,'Level 4 - Terkelola'],[4.51,'Level 5 - Inovatif']])assert.equal(scoring.level(score),label);
});
test('Excel export preserves all package parts and only changes maturity index and validation cells',()=>{
  const zip=require('../src/services/ikasTemplateZip'),buffer=fs.readFileSync(path.join(__dirname,'../data/ikas-template.xlsx'));
  const controls=structuredClone(seed.controls),assessment={scores:Object.fromEntries(controls.map(row=>[row.id,3])),notes:{[controls[0].id]:'Validasi & bukti <aman>\nBaris kedua'},attachments:{},targetScores:{},respondent:{D4:'Tidak boleh mengganti template',D13:'2027'}};
  const exported=workbook.write({controls:{ikas:controls},assessment},2027),book=XLSX.read(exported,{type:'buffer'}),original=source();
  assert.deepEqual(book.SheetNames,original.SheetNames);assert.equal(book.Sheets.Responden.D13.v,original.Sheets.Responden.D13.v);assert.equal(book.Sheets['I Identifikasi'].D5.v,3);assert.equal(book.Sheets['I Identifikasi'].K5.v,assessment.notes[controls[0].id]);
  const before=zip.entries(buffer),after=zip.entries(exported),paths=workbook.sheetPaths(buffer),modified=new Set(seed.domains.map(domain=>paths.get(domain.sheet)));
  assert.deepEqual(after.rows.map(row=>row.name),before.rows.map(row=>row.name));
  for(const entry of before.rows){const next=after.rows.find(row=>row.name===entry.name);if(!modified.has(entry.name)){assert.deepEqual(next.raw,entry.raw,entry.name+' unchanged');continue;}
    const strip=xml=>xml.replace(/<c\b[^>]*\br="(?:D|K)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g,match=>{const address=match.match(/\br="([^"]+)"/)[1];const row=Number(address.slice(1));return seed.controls.some(control=>paths.get(control.ikas.sourceSheet)===entry.name&&control.ikas.sourceRow===row)?'INPUT '+address:match;});
    assert.equal(strip(next.content.toString()),strip(entry.content.toString()),entry.name+' formatting and non-input cells unchanged');
  }
  const imported=workbook.read(exported);assert.equal(imported.scores[controls[0].id],3);assert.equal(imported.notes[controls[0].id],assessment.notes[controls[0].id]);
  assert.throws(()=>workbook.read(Buffer.from('invalid file')),{status:400});
});
test('domain import follows identifiers and accepts a future template with added questions',()=>{
  const zip=require('../src/services/ikasTemplateZip'),buffer=fs.readFileSync(path.join(__dirname,'../data/ikas-template.xlsx')),parts=zip.entries(buffer),sheet=workbook.sheetPaths(buffer).get('I Identifikasi');
  let xml=parts.rows.find(row=>row.name===sheet).content.toString();
  const cell=(column,value)=>'<c r="'+column+'85" t="inlineStr"><is><t>'+value+'</t></is></c>';
  const row='<row r="85">'+cell('A','z')+cell('B','Pertanyaan tambahan tahun depan')+cell('C','Tata Kelola')+'<c r="D85"><v>4</v></c>'+['E','F','G','H','I','J'].map((column,index)=>cell(column,'Rubrik baru '+index)).join('')+cell('K','Validasi baru')+'</row>';
  xml=xml.replace('</sheetData>',row+'</sheetData>').replace('ref="A1:K84"','ref="A1:K85"');
  const updated=zip.patch(buffer,new Map([[sheet,xml]])),payload=workbook.read(updated,['IDENTIFIKASI']);
  const added=payload.controls.find(row=>row.subcategory==='Pertanyaan tambahan tahun depan');assert.ok(added);assert.equal(added.id,'IKAS-1.5.5-z');assert.equal(payload.scores[added.id],4);assert.equal(payload.notes[added.id],'Validasi baru');assert.deepEqual(payload.domains,['IDENTIFIKASI']);assert.ok(payload.template);
  const all=workbook.read(updated);assert.equal(all.controls.length,182);
  const exported=workbook.write({controls:{ikas:all.controls},assessment:{scores:all.scores,notes:all.notes},ikasWorkbookTemplate:payload.template});
  assert.equal(XLSX.read(exported,{type:'buffer'}).Sheets['I Identifikasi'].D85.v,4);
  assert.throws(()=>workbook.read(buffer,['INVALID']),{status:400});
});
