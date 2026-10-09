const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../src/services/assetManagementService'),photos=require('../src/services/assetRackPhotoService');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5foAAAAASUVORK5CYII=','base64');
const data={tag:'SRV-01',name:'Server',owner:'Network',type:'Server',status:'planned',criticality:'medium',ownerEmail:'',renewalDate:'',reminderEnabled:false,reminderDays:30};
test('asset and front/rear photos commit atomically; invalid photos never create an asset',async()=>{
 const {pool}=require('../src/config/database');const original={query:pool.query,connect:pool.connect};let failRear=false;const calls=[];
 pool.query=async()=>({rows:[],rowCount:0});pool.connect=async()=>({release(){},query:async(sql,args)=>{calls.push({sql,args});if(failRear&&sql.startsWith('INSERT INTO managed_asset_photos')&&args[1]==='rear')throw Error('photo write failed');if(sql.startsWith('SELECT data FROM managed_assets'))return {rows:[{data}],rowCount:1};return {rows:[],rowCount:1};}});
 try{const files={front:[{buffer:png,mimetype:'image/png'}],rear:[{buffer:png,mimetype:'image/png'}]};
 const saved=await service.saveAsset(null,data,{files,body:{}});assert.ok(saved.id);assert.equal(calls.filter(c=>c.sql.startsWith('INSERT INTO managed_asset_photos')).length,2);assert.ok(calls.filter(c=>c.sql.startsWith('INSERT INTO managed_asset_photos')).every(c=>c.args[0]===saved.id));assert.equal(calls.at(-1).sql,'COMMIT');
 calls.length=0;failRear=true;await assert.rejects(service.saveAsset(null,data,{files,body:{}}),/photo write/);assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(calls.some(c=>c.sql==='COMMIT'),false);
 calls.length=0;await assert.rejects(service.saveAsset(null,data,{files:{front:files.front,rear:[{buffer:Buffer.from('invalid'),mimetype:'image/png'}]},body:{}}),/valid/);assert.equal(calls.length,0);
 calls.length=0;failRear=false;await service.saveAsset(saved.id,data,{files:{},body:{removeFront:'false',removeRear:'false'}});assert.equal(calls.some(c=>/INSERT INTO managed_asset_photos|DELETE FROM managed_asset_photos/.test(c.sql)),false);
 }finally{pool.query=original.query;pool.connect=original.connect;}
});
test('registration accepts photos under Asset Register create/update permissions and restricts rack photo access',async()=>{
 const express=require('express'),permissions=require('../src/services/permissionService');const original={has:permissions.has,save:service.saveAsset,list:photos.list,read:photos.read};let received,scope;
 permissions.has=async(role,key,action)=>key==='asset-register'&&(role==='creator'?['read','create'].includes(action):role==='editor'?['read','update'].includes(action):false);
 service.saveAsset=async(id,body,photoInput)=>{received={id,body,photoInput};return {id:id||'new',...body};};photos.list=async value=>{scope=value;return {assets:[],racks:[]};};photos.read=async()=>({mime_type:'image/png',content:png});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={role:req.get('X-Role')||'creator'};next();});app.use('/api/asset-management',require('../src/routes/assetManagementRoutes'));app.use(require('../src/middleware/errorHandler').errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/asset-management',id='11111111-1111-4111-8111-111111111111';
 try{const form=new FormData();form.append('data',JSON.stringify(data));form.append('front',new Blob([png],{type:'image/png'}),'front.png');form.append('rear',new Blob([png],{type:'image/png'}),'rear.png');
 let r=await fetch(base+'/assets',{method:'POST',body:form});assert.equal(r.status,201);assert.equal(received.body.tag,'SRV-01');assert.deepEqual(received.photoInput.files.front[0].buffer,png);assert.deepEqual(received.photoInput.files.rear[0].buffer,png);
 r=await fetch(base+'/assets/'+id,{method:'PUT',body:form});assert.equal(r.status,403);
 r=await fetch(base+'/assets/'+id,{method:'PUT',headers:{'X-Role':'editor'},body:form});assert.equal(r.status,200);assert.equal(received.id,id);
 r=await fetch(base+'/photos');assert.equal(r.status,200);assert.equal(scope,'assets');
 r=await fetch(base+'/photos/assets/'+id+'/front');assert.equal(r.status,200);
 r=await fetch(base+'/photos/racks/'+id+'/front');assert.equal(r.status,403);
 r=await fetch(base+'/assets/'+id,{method:'PUT',headers:{'X-Role':'editor','Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200);assert.equal(received.photoInput,null);
 }finally{await new Promise(r=>server.close(r));permissions.has=original.has;service.saveAsset=original.save;photos.list=original.list;photos.read=original.read;}
});
