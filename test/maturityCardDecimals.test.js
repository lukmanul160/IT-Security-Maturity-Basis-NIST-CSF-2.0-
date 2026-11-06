const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root='frontend/client/src/workspace/features/';
function definition(file,name){const text=fs.readFileSync(root+file,'utf8'),start=text.indexOf('function '+name+'('),end=text.indexOf('\nfunction ',start+1);return text.slice(start,end<0?undefined:end);}
function fixture(){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:id.includes('Filter')?'all':'',style:{},nextElementSibling:{},closest:()=>({querySelector:()=>({})})});return nodes.get(id);};
 const fn={id:'GV',name:'GOVERN',description:'Fixture'};
 const rows=Array.from({length:10},(_,index)=>({id:String(index),fn,function:'GOVERN (GV)',category:'Fixture',subcategory:'Fixture: '+index,name:'Control'}));
 const policy=id=>Number(id)<4?2:1,practice=id=>Number(id)<3?2:1;
 return {nodes,rows,context:vm.createContext({$,document:{querySelectorAll:()=>[]},escapeHtml:String,renderGapSummaries(){},rows,functions:[fn],controlsFor:()=>rows,allControls:()=>rows,policyScoreFor:policy,scoreFor:practice,privacyScoreFor:(item,kind)=>kind==='policy'?policy(item.id):practice(item.id),maturityLabels:['','Initial','Repeatable'],renderSummary(){},privacyRows:rows,privacyFunctions:()=>[fn],privacyTargetScoreAverage:()=>3,privacyTargetScoreFor:()=>3,sortAssessmentRows:rows=>rows,privacySort:{},privacyAssessmentPage:1,renderAssessmentPagination:()=>1,privacyAttachmentControl:()=>'',assessmentGapButton:()=>'',renderPrivacyRadar(){}})};
}
test('CSF maturity cards retain 1.3 practice and 1.4 policy averages from integer controls',()=>{
 const {nodes,context}=fixture();
 context.categoryOrder=['Fixture'];context.categoryLabel=value=>value;context.csfTargetScoreFor=()=>3;
 const shared=fs.readFileSync(root+'shared/state-and-access.js','utf8');
 vm.runInContext(shared.split('\n').filter(line=>line.startsWith('const categorySummary =')||line.startsWith('const stats =')).join('\n'),context);
 vm.runInContext(definition('assessment/overview-and-csf.js','renderOverview')+'\nrenderOverview()',context);
 assert.equal(nodes.get('overallScore').textContent,'1.4');
 assert.equal(nodes.get('overallPolicyScore').textContent,'1.4');
 assert.equal(nodes.get('overallProcessScore').textContent,'1.3');
 assert.match(nodes.get('functionCards').innerHTML,/Policy<\/small><strong>1\.4<\/strong>/);
 assert.match(nodes.get('functionCards').innerHTML,/Practice<\/small><strong>1\.3<\/strong>/);
});
test('Privacy maturity cards and summary retain decimal averages from integer controls',()=>{
 const {nodes,context}=fixture();
 vm.runInContext(definition('privacy/assessment.js','renderPrivacy')+'\nrenderPrivacy()',context);
 assert.equal(nodes.get('privacyOverallScore').textContent,'1.4');
 assert.equal(nodes.get('privacyOverallPolicyScore').textContent,'1.4');
 assert.equal(nodes.get('privacyOverallProcessScore').textContent,'1.3');
 assert.match(nodes.get('privacyFunctionCards').innerHTML,/Policy<\/small><strong>1\.4<\/strong>/);
 assert.match(nodes.get('privacyFunctionCards').innerHTML,/Practice<\/small><strong>1\.3<\/strong>/);
 assert.match(nodes.get('privacySummaryBody').innerHTML,/<td>1\.4<\/td><td>1\.3<\/td>/);
});
test('IKAS weighted maturity cards preserve 1.30 and 1.40 without integer rounding',()=>{
 const scoring=require('../src/shared/ikasScoring');
 const controls=require('../data/ikas-data.json').controls;
 const source=fs.readFileSync(root+'ikas/assessment.js','utf8');
 const display=source.split('\n').find(line=>line.startsWith('const ikasDisplay='));
 for(const [domainValues,expected] of [[{IDENTIFIKASI:1,PROTEKSI:2,DETEKSI:1,'PENANGGULANGAN DAN PEMULIHAN':1},'1.30'],[{IDENTIFIKASI:1,PROTEKSI:1,DETEKSI:1,'PENANGGULANGAN DAN PEMULIHAN':3},'1.40']]){
   const scores=Object.fromEntries(controls.map(row=>[row.id,domainValues[row.function]]));
   const result=scoring.summarize(controls,{scores});
   const context=vm.createContext({value:result.overall});
   assert.equal(vm.runInContext(display+'\nikasDisplay(value)',context),expected);
 }
});

test('unassessed Privacy scores stay empty and combined uses only an assessed dimension',()=>{
 const {nodes,context}=fixture();context.privacyScoreFor=()=>null;
 vm.runInContext(definition('privacy/assessment.js','renderPrivacy')+'\nrenderPrivacy()',context);
 for(const prefix of ['privacyOverallPolicy','privacyOverallProcess','privacyOverall'])assert.equal(nodes.get(prefix+'Meter').style.width,'0%');
 assert.equal(nodes.get('privacyOverallLabel').textContent,'Belum dinilai');
 context.privacyScoreFor=(item,kind)=>kind==='policy'?2:null;
 vm.runInContext('renderPrivacy()',context);
 assert.equal(nodes.get('privacyOverallPolicyScore').textContent,'2.0');
 assert.equal(nodes.get('privacyOverallScore').textContent,'2.0');
 assert.equal(nodes.get('privacyOverallProcessLabel').textContent,'Belum dinilai');
});
