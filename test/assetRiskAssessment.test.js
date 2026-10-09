const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {assess}=require('../src/services/assetRiskAssessmentService'),assets=require('../src/services/assetManagementService');
test('CIA assessment uses the highest impact and a 5 by 5 likelihood matrix, consistent in browser and server',()=>{
 const source=fs.readFileSync('frontend/client/src/workspace/components/AssetManagementView.vue','utf8');const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/import .*?from 'vue';/,'');const c=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn();}}),nextTick:async()=>{},onMounted(){},onBeforeUnmount(){}});vm.runInContext(script,c);
 for(let confidentiality=1;confidentiality<=5;confidentiality++)for(let integrity=1;integrity<=5;integrity++)for(let availability=1;availability<=5;availability++)for(let likelihood=1;likelihood<=5;likelihood++){
  const input={confidentiality,integrity,availability,likelihood};const result=assess(input),impact=Math.max(confidentiality,integrity,availability),score=impact*likelihood;assert.equal(result.impact,impact);assert.equal(result.score,score);assert.equal(result.level,score<=4?'low':score<=12?'medium':'high');c.input=input;const browser=JSON.parse(vm.runInContext('JSON.stringify(assessmentResult(input))',c));assert.deepEqual(browser,{impact,score,level:result.level});
 }
});
test('invalid and incomplete assessment is rejected and client-supplied scores cannot override the result',()=>{
 const valid={confidentiality:5,integrity:1,availability:2,likelihood:3};assert.equal(assess({...valid,score:1,level:'low',impact:1}).level,'high');for(const input of [null,[],{...valid,likelihood:''},{...valid,confidentiality:6},{...valid,integrity:'2'},{...valid,availability:NaN}])assert.throws(()=>assess(input),/1-5/);
 const data={tag:'FW-01',name:'Firewall',owner:'Network',type:'Firewall',status:'in-use',criticality:'high',reminderEnabled:false,reminderDays:30};assert.equal(assets.validateAsset(data).assetAssessment,undefined);assert.equal(assets.validateAsset({...data,assetAssessment:valid}).assetAssessment.level,'high');
});
