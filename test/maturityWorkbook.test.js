const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const XLSX=require('xlsx');
const service=require('../src/services/maturityWorkbookService');
const zip=require('../src/services/ikasTemplateZip');
const {mergeMaturityWorkbook}=require('../src/services/assessmentPeriodService');
const original=fs.readFileSync('data/maturity-template.xlsx');
const seed=framework=>framework==='privacy'?service.read(original,'privacy').controls.map(({sourceRow,...row})=>row):require('../data/csf-data.json');
const snapshot=framework=>({controls:{[framework]:structuredClone(seed(framework))},targets:{[framework]:[]},assessment:{scores:{},policyScores:{},practiceScores:{},notes:{},attachments:{}}});
test('original template is preserved and the four columns contain independent current assessment values',()=>{
  const csf=snapshot('csf'),privacy=snapshot('privacy');
  csf.assessment.policyScores['GV-OC-01']=0;csf.assessment.practiceScores['GV-OC-01']=4;
  csf.assessment.notes['policy-GV-OC-01']='Kebijakan & bukti\nBaris kedua <uji>';
  csf.assessment.notes['practice-GV-OC-01']='Praktik berbeda =1+1';
  privacy.assessment.policyScores['ID.IM-P1']=2;privacy.assessment.practiceScores['ID.IM-P1']=5;
  privacy.assessment.notes['policy-ID.IM-P1']='Privacy policy';privacy.assessment.notes['practice-ID.IM-P1']='Privacy practice';
  const output=service.write({csf,privacy},2028),book=XLSX.read(output,{type:'buffer'});
  assert.deepEqual(book.SheetNames,XLSX.read(original,{type:'buffer'}).SheetNames);
  for(const [framework,id,policy,practice] of [['csf','GV-OC-01',0,4],['privacy','ID.IM-P1',2,5]]) {
    const imported=service.read(output,framework);assert.equal(imported.policyScores[id],policy);assert.equal(imported.practiceScores[id],practice);
    assert.equal(imported.notes['policy-'+id],({csf,privacy})[framework].assessment.notes['policy-'+id]);
    assert.equal(imported.notes['practice-'+id],({csf,privacy})[framework].assessment.notes['practice-'+id]);
  }
  assert.equal(book.Sheets['CSF 2.0'].G6?.v,undefined,'Template demonstration scores must be cleared');
  assert.equal(book.Sheets['NIST CSF Summary'].E1.v,2028);
  assert.equal(book.Sheets['NIST CSF Summary'].E4.v,0);
  assert.equal(book.Sheets['NIST CSF Summary'].F4.v,4/5);
  const before=new Map(zip.entries(original).rows.map(r=>[r.name,r.content]));
  for(const part of zip.entries(output).rows)if(!/^xl\/(worksheets\/sheet[3456]\.xml|charts\/chart\d+\.xml|workbook\.xml)$/.test(part.name))assert.deepEqual(part.content,before.get(part.name),part.name+' must be preserved');
  assert.deepEqual(book.Sheets['CSF 2.0']['!merges'],XLSX.read(original,{type:'buffer'}).Sheets['CSF 2.0']['!merges']);
});
test('new control/category/subcategory export and import preserve scores, multiline reasoning and existing evidence',()=>{
  for(const framework of ['csf','privacy']) {
    const data=snapshot(framework),id=framework==='csf'?'GV-NEW-01':'ID.NEW-P1',subcategory=framework==='csf'?'GV.NEW-01: Kontrol tambahan':'ID.NEW-P1: Kontrol tambahan';
    const control={id,function:data.controls[framework][0].function,category:'Kategori tambahan (NEW)',subcategory,implementation:'Contoh',references:'Referensi'};
    data.controls[framework].push(control);data.assessment.policyScores[id]=1;data.assessment.practiceScores[id]=3;
    data.assessment.notes['policy-'+id]='Alasan\nKebijakan';data.assessment.notes['practice-'+id]='Alasan praktik';
    const output=service.write({[framework]:data},2027),parsed=service.read(output,framework),incoming=parsed.controls.find(r=>r.id===id);
    assert.equal(incoming.category,control.category);assert.equal(incoming.subcategory,subcategory);assert.equal(parsed.policyScores[id],1);
    assert.equal(parsed.practiceScores[id],3);assert.equal(parsed.notes['policy-'+id],'Alasan\nKebijakan');
    const prior=snapshot(framework),first=prior.controls[framework][0];first.evidence=[{path:'upload/policy.pdf'}];
    prior.assessment.attachments[first.id]=[{path:'upload/proof.pdf'}];prior.gaps={[framework]:[{controlCode:first.id,description:'gap'}]};
    const retained=structuredClone(prior.assessment.attachments);const result=mergeMaturityWorkbook(prior,framework,parsed);
    assert.equal(result.added,1);assert.ok(prior.controls[framework].some(r=>r.id===id));assert.deepEqual(prior.assessment.attachments,retained);assert.deepEqual(prior.controls[framework][0].evidence,[{path:'upload/policy.pdf'}]);assert.equal(prior.gaps[framework].length,1);
    const summary=XLSX.read(output,{type:'buffer'}).Sheets[service.config[framework].summary];assert.ok(Object.values(summary).some(c=>c?.v==='Kategori tambahan (NEW)'));
  }
});
test('invalid scores, duplicate control codes, missing hierarchy and wrong headers are rejected before import',()=>{
  const mutate=fn=>{const book=XLSX.read(original,{type:'buffer'});fn(book.Sheets['CSF 2.0']);return ()=>service.parse(book,'csf');};
  for(const value of [-1,6,'bad',true])assert.throws(mutate(s=>s.G5={t:'s',v:value}),{status:400});
  assert.throws(mutate(s=>s.G5={t:'n',v:2,f:'1+1'}),/bukan formula/);
  assert.throws(mutate(s=>s.C6={t:'s',v:s.C5.v}),/duplikat/);
  assert.throws(mutate(s=>delete s.A3),/Function/);
  assert.throws(mutate(s=>s.H2={t:'s',v:'Wrong header'}),/Header/);
  assert.throws(()=>service.read(Buffer.from('not a zip'),'csf'),{status:400});
});
test('blank imported scores clear legacy fallback only for imported controls and preserve controls outside the file',()=>{
  const data=snapshot('csf'),id=data.controls.csf[0].id;data.assessment.scores[id]=5;data.assessment.practiceScores[id]=4;
  const payload={controls:[{...data.controls.csf[0]}],policyScores:{},practiceScores:{},notes:{['policy-'+id]:'',['practice-'+id]:''}};
  const count=data.controls.csf.length;mergeMaturityWorkbook(data,'csf',payload);
  assert.equal(data.controls.csf.length,count);assert.equal(data.assessment.scores[id],undefined);assert.equal(data.assessment.practiceScores[id],undefined);
});
