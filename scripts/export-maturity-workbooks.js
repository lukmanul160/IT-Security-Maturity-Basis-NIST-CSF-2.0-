// Read saved assessments and generate reviewable workbooks without importing any data.
const fs=require('node:fs/promises');
const path=require('node:path');
const {pool}=require('../src/config/database');
const periods=require('../src/services/assessmentPeriodService');
const workbook=require('../src/services/maturityWorkbookService');
async function run(){
  const year=periods.validateYear(process.argv[2]||2026);await periods.ensureStore();await fs.mkdir('output',{recursive:true});
  for(const framework of ['csf','privacy']){
    const {data}=await periods.workbookSnapshot(framework,year),buffer=workbook.write({[framework]:data},year);
    const parsed=workbook.read(buffer,framework);
    for(const control of data.controls[framework])for(const [scores,prefix]of [['policyScores','policy-'],['practiceScores','practice-']]){
      const expected=data.assessment[scores]?.[control.id]??(scores==='practiceScores'?data.assessment.scores?.[control.id]:undefined);
      if(parsed[scores][control.id]!==expected)throw Error('Export score mismatch: '+control.id+' '+scores);
      if(parsed.notes[prefix+control.id] !== (data.assessment.notes?.[prefix+control.id]||''))throw Error('Export reasoning mismatch: '+control.id);
    }
    const file=path.join('output',`NIST-${framework==='csf'?'CSF-2.0':'Privacy'}-Maturity-${year}.xlsx`);await fs.writeFile(file,buffer);
    console.log(JSON.stringify({file,controls:data.controls[framework].length,policyScores:Object.keys(parsed.policyScores).length,practiceScores:Object.keys(parsed.practiceScores).length,verified:true}));
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
