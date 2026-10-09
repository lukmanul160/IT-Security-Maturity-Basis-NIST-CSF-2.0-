const test=require('node:test');
const assert=require('node:assert/strict');
const photos=require('../src/services/assetRackPhotoService');
const assets=require('../src/services/assetManagementService');
const fs=require('node:fs'),vm=require('node:vm');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5foAAAAASUVORK5CYII=','base64');
test('photo validation rejects active content, disguised MIME types and oversized images',()=>{
 assert.equal(photos.validateFile({buffer:png,mimetype:'image/png'}).type,'image/png');
 assert.throws(()=>photos.validateFile({buffer:Buffer.from('<svg onload="alert(1)"></svg>'),mimetype:'image/svg+xml'}),/valid/);
 assert.throws(()=>photos.validateFile({buffer:png,mimetype:'image/jpeg'}),/valid/);
 assert.throws(()=>photos.validateFile({buffer:Buffer.alloc(5*1024*1024+1),mimetype:'image/png'}),/5 MB/);
 assert.throws(()=>photos.validateFile({buffer:Buffer.alloc(0),mimetype:'image/png'}),/5 MB/);
});
test('front and rear shallow devices share U while same-side and full-depth collisions are rejected',()=>{
 const rows=[{asset_id:'front',start_unit:3,height:2,facing:'front',full_depth:false}];
 const rear={assetId:'rear',startUnit:3,height:2,facing:'rear',fullDepth:false};
 assert.doesNotThrow(()=>assets.validatePlacement(rear,42,rows));
 assert.throws(()=>assets.validatePlacement({...rear,facing:'front'},42,rows),/bertabrakan/);
 assert.throws(()=>assets.validatePlacement({...rear,fullDepth:true},42,rows),/bertabrakan/);
 assert.throws(()=>assets.validatePlacement(rear,42,[{...rows[0],full_depth:true}]),/bertabrakan/);
 assert.throws(()=>assets.validatePlacement({...rear,facing:'left'},42,rows),/Orientasi/);
 assert.throws(()=>assets.validatePlacement({...rear,fullDepth:'false'},42,rows),/Orientasi/);
 assert.throws(()=>assets.validatePlacement({...rear,facing:undefined,fullDepth:undefined},42,rows),/bertabrakan/);
});
function context(){const source=fs.readFileSync('frontend/client/src/workspace/components/AssetManagementView.vue','utf8');const c=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn();}}),nextTick:async()=>{},onMounted(){},onBeforeUnmount(){}});vm.runInContext(source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/import .*?from 'vue';/,''),c);vm.runInContext("view.value='server-racks';selectedRack.value='r';racks.value=[{id:'r',units:42}];placements.value=[{asset_id:'a',rack_id:'r',start_unit:4,height:2,facing:'rear',full_depth:true},{asset_id:'b',rack_id:'r',start_unit:10,height:1,facing:'front',full_depth:false}];photoCatalog.value={assets:[{owner_id:'a',side:'front',version:'front-v'},{owner_id:'a',side:'rear',version:'rear-v'}],racks:[]};",c);return c;}
test('rack drawings span exact U height and map front/rear photos according to orientation',()=>{
 const c=context();assert.equal(vm.runInContext('rackBlockStyle(placements.value[0]).height',c),'52px');
 assert.equal(vm.runInContext('rackBlockStyle(placements.value[0]).top',c),'962px');
 assert.match(vm.runInContext("devicePhotoUrl(placements.value[0],'rear')",c),/a\/front\?v=front-v$/);
 assert.match(vm.runInContext("devicePhotoUrl(placements.value[0],'front')",c),/a\/rear\?v=rear-v$/);
 assert.equal(vm.runInContext("devicesForSide('rear').length",c),1);
 assert.equal(vm.runInContext("devicesForSide('front').length",c),2);
 vm.runInContext("photoFailed('assets','a','front')",c);
 assert.equal(vm.runInContext("devicePhotoUrl(placements.value[0],'rear')",c),'');
});
test('dragging between front/rear views respects side occupancy and keeps full depth',()=>{
 const c=context();vm.runInContext("draggedDevice.value={...placements.value[1],offset:0};",c);
 assert.equal(vm.runInContext("rackDropCandidate('r',4,'rear').error",c),'Posisi U bertabrakan dengan perangkat lain.');
 assert.equal(vm.runInContext("rackDropCandidate('r',10,'rear').error",c),'');
 assert.equal(vm.runInContext("rackDropCandidate('r',10,'rear').facing",c),'rear');
 assert.equal(vm.runInContext("rackDropCandidate('r',10,'rear').fullDepth",c),false);
});
test('photo API enforces access, handles multipart data and serves images without MIME sniffing',async()=>{
 const express=require('express'),permissions=require('../src/services/permissionService');
 const saved={has:permissions.has,save:photos.save,read:photos.read};let received;
 permissions.has=async(role,key,action)=>role==='admin'||(role==='viewer'&&action==='read');
 photos.save=async(kind,id,files)=>{received={kind,id,files};return {ok:true};};
 photos.read=async()=>({mime_type:'image/png',content:png});
 const app=express();app.use((req,res,next)=>{req.user={role:req.get('X-Test-Role')||'admin'};next();});app.use('/assets',require('../src/routes/assetManagementRoutes'));app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/assets/photos/assets/11111111-1111-4111-8111-111111111111';
 try{const form=new FormData();form.append('front',new Blob([png],{type:'image/png'}),'front.png');
 let response=await fetch(url,{method:'PUT',headers:{'X-Test-Role':'viewer'},body:form});assert.equal(response.status,403);assert.equal(received,undefined);
 response=await fetch(url,{method:'PUT',body:form});assert.equal(response.status,200);assert.equal(received.kind,'assets');assert.deepEqual(received.files.front[0].buffer,png);
 response=await fetch(url+'/front',{headers:{'X-Test-Role':'viewer'}});assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 response=await fetch(url+'/front',{headers:{'X-Test-Role':'denied'}});assert.equal(response.status,403);
 }finally{await new Promise(r=>server.close(r));permissions.has=saved.has;photos.save=saved.save;photos.read=saved.read;}
});
test('front/rear photo updates commit together and roll back if a second write fails',async()=>{
 const {pool}=require('../src/config/database');const saved={query:pool.query,connect:pool.connect};const writes=[];let failRear=false;
 pool.query=async()=>({rows:[],rowCount:0});pool.connect=async()=>({release(){},query:async(sql,args)=>{writes.push({sql,args});if(sql.startsWith('SELECT id'))return {rows:[{id:'a'}],rowCount:1};if(failRear&&sql.startsWith('INSERT INTO')&&args[1]==='rear')throw Error('second write failed');return {rows:[],rowCount:1};}});
 try{const files={front:[{buffer:png,mimetype:'image/png'}],rear:[{buffer:png,mimetype:'image/png'}]};
 await photos.save('assets','a',files,{});assert.equal(writes.filter(q=>q.sql.startsWith('INSERT INTO managed_asset_photos')).length,2);assert.equal(writes.filter(q=>q.sql.startsWith('INSERT INTO evidence_files')).length,2);assert.ok(writes.filter(q=>q.sql.startsWith('INSERT INTO evidence_files')).every(q=>q.args[2].equals(png)&&q.args[0].startsWith('Asset Management/assets/')));assert.equal(writes.at(-1).sql,'COMMIT');
 writes.length=0;failRear=true;await assert.rejects(photos.save('assets','a',files,{}),/second write/);assert.equal(writes.at(-1).sql,'ROLLBACK');assert.equal(writes.some(q=>q.sql==='COMMIT'),false);
 writes.length=0;await assert.rejects(photos.save('assets','a',{...files,rear:[{buffer:Buffer.from('invalid'),mimetype:'image/png'}]},{}),/valid/);assert.equal(writes.length,0);
 }finally{pool.query=saved.query;pool.connect=saved.connect;}
});
