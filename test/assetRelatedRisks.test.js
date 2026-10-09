const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../src/services/assetManagementService'),{pool}=require('../src/config/database');
test('related risk links validate IDs, preserve asset data and roll back stale selections',async()=>{
 const original={query:pool.query,connect:pool.connect};const calls=[];let missing=false;
 pool.query=async()=>({rows:[]});pool.connect=async()=>({release(){},query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT id FROM managed_assets'))return {rows:[{id:'a'}]};if(sql.startsWith('SELECT risk_id FROM risk_register'))return {rows:missing?[]:args[0].map(risk_id=>({risk_id}))};return {rows:[]};}});
 try{assert.deepEqual((await service.saveRiskLinks('a',['R-01','R-02'])).riskRegisterIds,['R-01','R-02']);assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(calls.some(c=>c.sql.includes('SET data=')),false);assert.equal(calls.some(c=>c.sql.startsWith('INSERT INTO asset_related_risks')),true);
  calls.length=0;missing=true;await assert.rejects(service.saveRiskLinks('a',['removed']),e=>e.status===409);assert.equal(calls.some(c=>c.sql.startsWith('DELETE')),false);assert.equal(calls.at(-1).sql,'ROLLBACK');
  await service.saveRiskLinks('a',[]);assert.equal(calls.at(-1).sql,'COMMIT');for(const ids of [null,[''],['R-01','R-01'],[123]])assert.throws(()=>service.validateRiskIds(ids),/tidak valid/);
 }finally{pool.query=original.query;pool.connect=original.connect;}
});
test('risk catalog and link API require Risk Register read plus asset permissions',async()=>{
 const permission=require('../src/services/permissionService'),riskService=require('../src/services/riskManagementService');const original={has:permission.has,list:riskService.listRegister,save:service.saveRiskLinks};let mutated=false;
 permission.has=async(role,key,action)=>key==='risk-management'?role!=='asset-only':key==='asset-register'&&(action==='read'||role==='editor');riskService.listRegister=async()=>[{riskId:'R-01'}];service.saveRiskLinks=async()=>{mutated=true;return {riskRegisterIds:['R-01']};};
 const app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{req.user={role:req.get('X-Role')||'viewer'};next();});app.use(require('../src/routes/assetManagementRoutes'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;const path='/assets/11111111-1111-4111-8111-111111111111/related-risks';
 try{assert.equal((await fetch(base+'/risk-catalog',{headers:{'X-Role':'asset-only'}})).status,403);assert.equal((await fetch(base+'/risk-catalog')).status,200);assert.equal((await fetch(base+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"riskRegisterIds":["R-01"]}'})).status,403);assert.equal(mutated,false);assert.equal((await fetch(base+path,{method:'PUT',headers:{'Content-Type':'application/json','X-Role':'editor'},body:'{"riskRegisterIds":["R-01"]}'})).status,200);assert.equal(mutated,true);}finally{await new Promise(r=>server.close(r));permission.has=original.has;riskService.listRegister=original.list;service.saveRiskLinks=original.save;}
});
