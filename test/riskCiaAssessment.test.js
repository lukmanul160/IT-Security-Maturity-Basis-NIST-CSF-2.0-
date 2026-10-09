const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const service=require('../src/services/riskManagementService'),{pool}=require('../src/config/database');
const {assess}=require('../src/services/assetRiskAssessmentService');
test('Risk Management browser assessment matches Asset Management for all 25 matrix cells',()=>{
 const source=fs.readFileSync('frontend/client/src/workspace/features/risk-management/register.js','utf8');
 const fields=Object.fromEntries(['rmAssetConfidentiality','rmAssetIntegrity','rmAssetAvailability','rmAssetValue','rmImpact','rmLikelihood','rmRiskRating','rmResidualLikelihood','rmResidualImpact','rmResidualRating','rmCiaSummary'].map(id=>[id,{value:''}]));
 const context=vm.createContext({$:id=>fields[id],document:{querySelectorAll:()=>[]}});
 vm.runInContext(source.slice(source.indexOf('function riskRatingFromScore'),source.indexOf('function synchronizeRiskDropdowns')),context);
 for(let impact=1;impact<=5;impact++)for(let likelihood=1;likelihood<=5;likelihood++){
  fields.rmAssetConfidentiality.value=impact;fields.rmAssetIntegrity.value=1;fields.rmAssetAvailability.value=1;fields.rmLikelihood.value=likelihood;
  vm.runInContext('updateRiskCalculations()',context);const expected=assess({confidentiality:impact,integrity:1,availability:1,likelihood});
  assert.equal(fields.rmImpact.value,expected.impact);assert.equal(fields.rmAssetValue.value,expected.impact);assert.equal(fields.rmRiskRating.value.toLowerCase(),expected.level);
 }
 fields.rmAssetIntegrity.value='';vm.runInContext('updateRiskCalculations()',context);assert.equal(fields.rmRiskRating.value,'');
});
test('server derives impact from CIA and rejects partial assessment instead of trusting supplied scores',async t=>{
 let written;
 t.mock.method(pool,'query',async(sql,args)=>{
  if(sql.includes('AS next_id'))return {rows:[{next_id:1}]};
  if(sql.startsWith('INSERT INTO risk_register')){const columns=sql.match(/\(([^)]+)\)/)[1].split(', ');written=Object.fromEntries(columns.map((c,i)=>[c,args[i]]));return {rows:[written],rowCount:1};}
  return {rows:[],rowCount:1};
 });
 const data={riskCategory:'Technical',effectedAsset:'Server',deviceName:'Server 1',identificationRisk:'Outage',assetConfidentiality:3,assetIntegrity:4,assetAvailability:4,likelihood:3,impact:1,riskRating:'Low',residualLikelihood:1,residualImpact:4};
 const saved=await service.create(data);assert.equal(saved.impact,4);assert.equal(saved.assetValue,4);assert.equal(saved.riskRating,'Medium');assert.equal(saved.residualRating,'Low');
 await assert.rejects(service.create({...data,assetIntegrity:''}),{status:400});
});
