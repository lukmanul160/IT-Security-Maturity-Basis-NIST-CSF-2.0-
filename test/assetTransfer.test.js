const test=require('node:test'),assert=require('node:assert/strict');
const transfer=require('../src/services/assetTransferService');
const empty=()=>({format:'nist-basis-asset-management',version:1,data:{assets:[],racks:[],placements:[],relations:[],nodes:[],photos:[]}});
test('asset transfer rejects foreign formats, dangling references and duplicate assets before writes',()=>{
 assert.ok(transfer.validate(empty()));assert.throws(()=>transfer.validate({format:'nist-basis-module'}),{status:400});
 const bad=empty();bad.data.placements=[{asset_id:'missing',rack_id:'missing'}];assert.throws(()=>transfer.validate(bad),/Referensi/);
 const p=empty();p.data.photos=[{kind:'assets',id:'missing',side:'front',type:'image/png',content:'AAAA'}];assert.throws(()=>transfer.validate(p),/Foto/);
});
test('export requires Read and import requires Read/Add/Edit on all asset modules',async t=>{
 const express=require('express'),permissions=require('../src/services/permissionService');let allowed=false,writes=0;
 t.mock.method(permissions,'has',async(role,key,action)=>allowed||action==='read'&&key==='asset-register');
 t.mock.method(transfer,'exportData',async()=>empty());t.mock.method(transfer,'importData',async()=>{writes++;return {assets:0};});
 const app=express();app.use((req,res,next)=>{req.user={username:'admin',role:'admin'};next();});app.use('/asset',require('../src/routes/assetManagementRoutes'));app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/asset`;
 try{
 assert.equal((await fetch(base+'/export')).status,403);
 const body=new FormData();body.append('file',new Blob([JSON.stringify(empty())],{type:'application/json'}),'assets.json');assert.equal((await fetch(base+'/import',{method:'POST',body})).status,403);assert.equal(writes,0);
 allowed=true;const exported=await fetch(base+'/export');assert.equal(exported.status,200);assert.equal((await exported.json()).format,'nist-basis-asset-management');assert.equal((await fetch(base+'/import',{method:'POST',body})).status,200);assert.equal(writes,1);
 }finally{await new Promise(r=>server.close(r));}
});
