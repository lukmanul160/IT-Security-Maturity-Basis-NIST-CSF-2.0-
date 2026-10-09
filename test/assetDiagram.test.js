const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../src/services/assetDiagramService'),{pool}=require('../src/config/database');
const id='11111111-1111-4111-8111-111111111111',node={id,x:50,y:100};
test('diagram validates asset IDs, duplicate nodes, bounded coordinates and required versions',()=>{
 assert.deepEqual(service.validate({nodes:[node],version:0}),[node]);
 for(const data of [{nodes:[node,node],version:0},{nodes:[{...node,x:Infinity}],version:0},{nodes:[{...node,y:-1}],version:0},{nodes:[{...node,id:'bad'}],version:0},{nodes:[node]}, {nodes:[node],version:-1}])assert.throws(()=>service.validate(data),/tidak valid/);
});
test('diagram save verifies registered assets and prevents overwriting a newer version',async()=>{
 const original={query:pool.query,connect:pool.connect};let current=0,missing=false;const calls=[];
 pool.query=async()=>({rows:[]});pool.connect=async()=>({release(){},query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT version'))return {rows:current?[{version:current}]:[]};if(sql.startsWith('SELECT id FROM'))return {rows:missing?[]:[{id}]};return {rows:[]};}});
 try{assert.equal((await service.save({nodes:[node],version:0})).version,1);assert.equal(calls.at(-1).sql,'COMMIT');assert.deepEqual(JSON.parse(calls.find(c=>c.sql.startsWith('INSERT')).args[0]),[node]);
 current=2;calls.length=0;await assert.rejects(service.save({nodes:[node],version:1}),e=>e.status===409);assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(calls.some(c=>c.sql.startsWith('INSERT')),false);
 missing=true;await assert.rejects(service.save({nodes:[node],version:2}),/tidak ditemukan/);
 }finally{pool.query=original.query;pool.connect=original.connect;}
});
test('diagram API allows readers and denies edits without modelling update permission',async()=>{
 const permissions=require('../src/services/permissionService'),original={has:permissions.has,read:service.read,save:service.save};let saved=false;
 permissions.has=async(role,key,action)=>key==='asset-modelling'&&(action==='read'||role==='editor');service.read=async()=>({nodes:[],version:0});service.save=async()=>{saved=true;return {nodes:[node],version:1};};
 const app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{req.user={role:req.get('X-Role')||'viewer'};next();});app.use(require('../src/routes/assetManagementRoutes'));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/diagram';
 try{assert.equal((await fetch(url)).status,200);assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:[node],version:0})})).status,403);assert.equal(saved,false);assert.equal((await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','X-Role':'editor'},body:JSON.stringify({nodes:[node],version:0})})).status,200);assert.equal(saved,true);}finally{await new Promise(r=>server.close(r));permissions.has=original.has;service.read=original.read;service.save=original.save;}
});
