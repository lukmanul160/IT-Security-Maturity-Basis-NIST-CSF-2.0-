const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const workbook=require('../src/services/tprmQuestionnaireWorkbook');
const zip=require('../src/services/ikasTemplateZip');
function fixture() {
  return {record:{id:17,vendorName:'Example vendor',responses:{templateId:4,revision:3,piiExposure:5,riskScore:500,vendorDocuments:[{path:'upload/private-evidence.pdf'}],'Security-1-decision':'No','Security-1':'Existing answer'}},template:{id:4,template_name:'Custom questionnaire',sections:[['Security',['MFA enabled?','Encrypted data?']],['Continuity',['BCP tested?']]]}};
}
function edit(buffer,action){const book=XLSX.read(buffer,{type:'buffer'});action(book);return XLSX.write(book,{type:'buffer',bookType:'xlsx'});}
function parse(buffer,data){return workbook.read(workbook.open(buffer),data);}
test('vendor workbook has editable answer columns, dropdown, protected structure and no private evidence paths or scores',()=>{
  const data=fixture(),buffer=workbook.write({...data,blank:true}),book=XLSX.read(buffer,{type:'buffer'});
  assert.deepEqual(book.SheetNames,['Panduan','Vendor','Kuesioner','_TPRM']);assert.equal(book.Workbook.Sheets[3].Hidden,2);assert.equal(book.Sheets.Kuesioner.C2.v,'MFA enabled?');
  const entries=zip.entries(buffer).rows,xml=entries.find(row=>row.name==='xl/worksheets/sheet3.xml').content.toString();
  assert.match(xml,/dataValidation type="list"/);assert.match(xml,/"Yes,No,N\/A"/);assert.match(xml,/sheetProtection/);assert.match(xml,/pane ySplit="1"/);
  assert.match(xml,/<c r="D2"[^>]*s="3"/);assert.equal(book.Sheets.Kuesioner.D3?.v,'');
  const all=entries.map(row=>row.content.toString()).join('');assert.equal(all.includes('private-evidence.pdf'),false);assert.equal(all.includes('riskScore'),false);
});
test('offline answers and evidence references import while blank rows, scores and uploaded documents remain intact',()=>{
  const data=fixture();const buffer=edit(workbook.write({...data,blank:true}),book=>{
    book.Sheets.Kuesioner.D2={t:'s',v:'Ya'};book.Sheets.Kuesioner.E2={t:'s',v:'MFA enabled for all admins'};book.Sheets.Kuesioner.F2={t:'s',v:'audit-report.pdf'};book.Sheets.Vendor.B3={t:'s',v:'Vendor respondent'};
  });
  const result=parse(buffer,data);assert.equal(result.preview.updated,1);assert.equal(result.preview.skipped,2);assert.equal(result.responses['Security-0-decision'],'Yes');assert.equal(result.responses['Security-0-evidenceReference'],'audit-report.pdf');assert.equal(result.responses['Security-1'],'Existing answer');assert.deepEqual(result.responses.vendorDocuments,data.record.responses.vendorDocuments);assert.equal(result.responses.riskScore,500);assert.equal(result.responses.offlineRespondent.name,'Vendor respondent');
});
test('questionnaire supports N/A and partially completed rows for later review',()=>{
  const data=fixture();const buffer=edit(workbook.write({...data,blank:true}),book=>{book.Sheets.Kuesioner.D2={t:'s',v:'N/A'};book.Sheets.Kuesioner.E2={t:'s',v:'No system access'};book.Sheets.Kuesioner.D4={t:'s',v:'No'};});
  const result=parse(buffer,data);assert.equal(result.preview.updated,2);assert.equal(result.preview.completeAnswers,1);assert.equal(result.responses['Continuity-0-decision'],'No');
});
test('import rejects another vendor, stale assessment and changed template version',()=>{
  const data=fixture(),buffer=workbook.write(data);
  assert.throws(()=>parse(buffer,{...data,record:{...data.record,id:99}}),/vendor lain/);
  assert.throws(()=>parse(buffer,{...data,record:{...data.record,responses:{...data.record.responses,revision:4,'Security-1':'New saved answer'}}}),/berubah setelah/);
  assert.throws(()=>parse(buffer,{...data,template:{...data.template,sections:[['Security',['Changed question']]]}}),/Versi pertanyaan/);
});
test('internal score and document updates while the vendor fills Excel do not invalidate unchanged offline answers',()=>{
  const data=fixture(),buffer=workbook.write(data);
  const current={...data.record,responses:{...data.record.responses,revision:4,piiExposure:2,vendorDocuments:[{path:'upload/new-internal-evidence.pdf'}]}};
  const result=parse(buffer,{...data,record:current});assert.equal(result.responses.piiExposure,2);assert.deepEqual(result.responses.vendorDocuments,current.responses.vendorDocuments);
});
test('invalid answers, duplicate IDs, missing rows, altered questions and formulas are rejected',()=>{
  const data=fixture(),buffer=workbook.write(data);
  for(const [change,message] of [
    [book=>{book.Sheets.Kuesioner.D2={t:'s',v:'Approved'};},/harus Yes/],
    [book=>{book.Sheets.Kuesioner.A3={t:'s',v:'Q0001'};},/duplikat/],
    [book=>{for(const column of ['A','B','C','D','E','F'])delete book.Sheets.Kuesioner[`${column}4`];},/hilang/],
    [book=>{book.Sheets.Kuesioner.C2={t:'s',v:'Different question'};},/pertanyaan.*berubah/],
    [book=>{book.Sheets.Kuesioner.E2={t:'s',v:'Cached',f:'HYPERLINK("https://example.com","Click")'};},/Formula/]
  ])assert.throws(()=>parse(edit(buffer,change),data),message);
});
test('rows can be reordered using their original question IDs',()=>{
  const data=fixture(),buffer=edit(workbook.write(data),book=>{for(const column of ['A','B','C','D','E','F']){const a=book.Sheets.Kuesioner[`${column}2`];book.Sheets.Kuesioner[`${column}2`]=book.Sheets.Kuesioner[`${column}3`];book.Sheets.Kuesioner[`${column}3`]=a;}});
  assert.equal(parse(buffer,data).responses['Security-1'],'Existing answer');
});
test('generic template can be filled for a selected vendor without importing approval or file paths',()=>{
  const data=fixture();const buffer=edit(workbook.write({template:data.template,blank:true}),book=>{book.Sheets.Vendor.B2={t:'s',v:data.record.vendorName};book.Sheets.Kuesioner.D2={t:'s',v:'Yes'};book.Sheets.Kuesioner.E2={t:'s',v:'Verified'};});
  const result=parse(buffer,data);assert.equal(result.preview.updated,1);assert.equal(result.responses.assessmentResult,undefined);
});
test('Excel date values and ordinary ISO text are both accepted for respondent dates',()=>{
  const data=fixture(),buffer=edit(workbook.write(data),book=>{book.Sheets.Vendor.B6={t:'n',v:46308,z:'yyyy-mm-dd'};});
  assert.match(parse(buffer,data).responses.offlineRespondent.date,/^2026-/);
});
