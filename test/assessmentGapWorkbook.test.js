const test=require('node:test');
const assert=require('node:assert/strict');
const XLSX=require('xlsx');
const {build,headers}=require('../src/services/assessmentGapWorkbook');
const service=require('../src/services/assessmentGapService');
test('gap Excel preserves requested header order and all details as literal text',()=>{
 const details={domain:'Govern',sub:'GV.OC',dimension:'People',gapNumber:'G-01',client:'Client',pic:'PIC',initiative:'Initiative',recommendation:'=1+1',yearOfInitiative:'2027',quarter:'Q1',confirmation:'Ya',supportingDocuments:'Dokumen',decisionNote:'Partially Comply'};
 const value=service.validate({description:'Gap',status:'Open',evidence:[],details});
 assert.deepEqual(value.details,details);
 const book=XLSX.read(build([{...value,controlCode:'GV.OC-01',evidence:[{name:'a.pdf',path:'upload/a.pdf'}]}]),{type:'buffer'});
 const sheet=book.Sheets.Gap;
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1});
 assert.deepEqual(rows[0],['No','Domain','Sub','People/ Process/ Technology','Gap Number','Gap','Client','PIC','Initiative','Recommendation','Year of Initiative','Kuartal','Konfirmasi','Evidence/ Dokumen Pendukung','Decision Note']);
 assert.equal(rows[1][9],'=1+1');assert.equal(sheet.J2.f,undefined);
 assert.equal(rows[1][13],'Dokumen\na.pdf (upload/a.pdf)');assert.equal(rows[1][14],'Partially Comply');
 assert.deepEqual(XLSX.utils.sheet_to_json(XLSX.read(build([]),{type:'buffer'}).Sheets.Gap,{header:1})[0],headers);
 assert.throws(()=>service.validate({...value,details:{pic:1}}),{status:400});
});

test('Decision accepts only the three compliance values for supplied details',()=>{
 for(const decisionNote of ['Comply','Partially Comply','Not Comply']) assert.equal(service.validate({description:'Gap',status:'Open',evidence:[],details:{decisionNote}}).details.decisionNote,decisionNote);
 for(const decisionNote of ['', 'Decision', 'comply', 'Closed']) assert.throws(()=>service.validate({description:'Gap',status:'Open',evidence:[],details:{decisionNote}}),{status:400});
});
test('CSF gap domain and sub are derived from linked Core metadata, overriding manual values',()=>{
 const control={function:'GOVERN (GV): Description',subcategory:'GV.OC-01: Organizational mission'};
 const details=service.linkedDetails('csf','GV-OC-01',control,{domain:'Wrong',sub:'Wrong',pic:'Team'});
 assert.deepEqual(details,{domain:'GOVERN (GV)',sub:'GV.OC-01',pic:'Team'});
 const book=XLSX.read(build([{framework:'csf',controlCode:'GV-OC-01',details,description:'Gap',evidence:[]}]),{type:'buffer'});
 const row=XLSX.utils.sheet_to_json(book.Sheets.Gap,{header:1})[1];
 assert.equal(row[1],'GOVERN (GV)');assert.equal(row[2],'GV.OC-01');
 assert.equal(service.linkedDetails('csf','DE-AE-02',null).sub,'DE.AE-02');
 assert.deepEqual(service.linkedDetails('privacy','ID-P1',control,{domain:'Existing'}),{domain:'Existing'});
});
test('initiative fields enforce quarter, year and category formats while allowing undetermined values',()=>{
 const base={description:'Gap',status:'Open',evidence:[],details:{decisionNote:'Comply'}};
 for(const quarter of ['Q1','Q2','Q3','Q4',''])assert.equal(service.validate({...base,details:{...base.details,quarter}}).details.quarter,quarter);
 for(const yearOfInitiative of ['2026','2027','1000','9999',''])assert.equal(service.validate({...base,details:{...base.details,yearOfInitiative}}).details.yearOfInitiative,yearOfInitiative);
 for(const dimension of ['People','Process','Technology',''])assert.equal(service.validate({...base,details:{...base.details,dimension}}).details.dimension,dimension);
 for(const [key,value] of [['quarter','Q5'],['quarter','1'],['yearOfInitiative','2026.5'],['yearOfInitiative','26'],['yearOfInitiative','2026-01-01'],['dimension','Other']])assert.throws(()=>service.validate({...base,details:{...base.details,[key]:value}}),{status:400});
});
test('gap numbers use category codes, monotonic suffixes and preserve an existing automatic number',()=>{
 const {assign}=require('../src/services/gapNumberService');
 const base={sub:'RS.CO-2',dimension:'People',gapNumberMode:'auto'};
 assert.equal(assign(base,[]).gapNumber,'G-RS.CO-2-PE-01');
 assert.equal(assign({...base,dimension:'Process'},[]).gapNumber,'G-RS.CO-2-PR-01');
 assert.equal(assign({...base,dimension:'Technology'},[]).gapNumber,'G-RS.CO-2-T-01');
 const rows=[{id:'a',details:{gapNumber:'G-RS.CO-2-PE-01'}},{id:'b',details:{gapNumber:'g-rs.co-2-pe-09'}}];
 assert.equal(assign({...base,gapNumber:'G-RS.CO-2-PE-90'},rows).gapNumber,'G-RS.CO-2-PE-10');
 assert.equal(assign(base,rows,'a').gapNumber,'G-RS.CO-2-PE-01');
 assert.equal(assign({...base,dimension:'Process'},rows,'a').gapNumber,'G-RS.CO-2-PR-01');
 assert.throws(()=>assign({...base,dimension:''},[]),{status:400});
});
test('manual numbers reject case-insensitive duplicates and invalid or empty input',()=>{
 const {assign}=require('../src/services/gapNumberService');
 const rows=[{id:'a',details:{gapNumber:'G-RS.CO-2-PE-01'}}];
 assert.throws(()=>assign({gapNumberMode:'manual',gapNumber:'g-rs.co-2-pe-01'},rows),{status:409});
 assert.equal(assign({gapNumberMode:'manual',gapNumber:' custom-01 '},rows).gapNumber,'CUSTOM-01');
 assert.equal(assign({gapNumberMode:'manual',gapNumber:'G-RS.CO-2-PE-01'},rows,'a').gapNumber,'G-RS.CO-2-PE-01');
 for(const gapNumber of ['', 'two words','<script>'])assert.throws(()=>assign({gapNumberMode:'manual',gapNumber},[]),{status:400});
 assert.equal(assign({},[]).gapNumber,'');
});
