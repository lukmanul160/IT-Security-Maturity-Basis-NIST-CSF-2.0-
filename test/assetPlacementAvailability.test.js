const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const service=require('../src/services/assetManagementService'),{pool}=require('../src/config/database');

test('placement rejects duplicate installs, accepts explicit moves and empty change references',async()=>{
 const original={query:pool.query,connect:pool.connect};let current={asset_id:'a',rack_id:'r1',rack_name:'Rack 01',start_unit:2,height:2};const calls=[];
 pool.query=async()=>({rows:[],rowCount:0});pool.connect=async()=>({release(){},query:async(sql,args)=>{calls.push(sql);if(sql.startsWith('SELECT * FROM asset_racks'))return {rows:[{id:'r2',units:12}]};if(sql.startsWith('SELECT data FROM managed_assets'))return {rows:[{data:{status:'in-use',type:'Server'}}]};if(sql.startsWith('SELECT d.*'))return {rows:current?[current]:[]};return {rows:[],rowCount:1};}});
 const data={assetId:'a',rackId:'r2',startUnit:4,height:2};
 try{
  await assert.rejects(service.place(data),e=>e.status===409&&/Rack 01.*U2-U3/.test(e.message));assert.equal(calls.some(sql=>sql.startsWith('INSERT INTO asset_rack_devices')),false);assert.equal(calls.at(-1),'ROLLBACK');
  calls.length=0;await service.place({...data,previousRackId:'r1',changeReference:''});assert.equal(calls.at(-1),'COMMIT');
  await assert.rejects(service.place({...data,previousRackId:'stale'}),e=>e.status===409);
  current=null;await assert.rejects(service.place({...data,previousRackId:'r1'}),/telah berubah/);
  await service.place(data);assert.equal(calls.at(-1),'COMMIT');
 }finally{pool.query=original.query;pool.connect=original.connect;}
});

test('asset status and relation changes accept missing change references',async()=>{
 const original={query:pool.query,connect:pool.connect};let relation=false;const data={tag:'SRV-01',name:'Server',owner:'Network',status:'in-use',type:'Server',criticality:'medium',reminderEnabled:false,reminderDays:30};
 pool.query=async()=>({rows:[],rowCount:0});pool.connect=async()=>({release(){},query:async(sql,args)=>{if(sql.startsWith('SELECT data FROM managed_assets'))return {rows:sql.includes('ANY')?[{data:{status:'in-use'}},{data:{status:'in-use'}}]:[{data:{status:'planned'}}]};if(sql.startsWith('INSERT INTO asset_relations')){relation=true;assert.equal(args[5],'');}return {rows:[],rowCount:1};}});
 try{await service.saveAsset('a',data);await service.relate({sourceId:'a',targetId:'b',type:'connects-to'});assert.equal(relation,true);}finally{pool.query=original.query;pool.connect=original.connect;}
});

test('selection remarks identify occupied racks, block new installs and allow explicit move dialogs',()=>{
 const source=fs.readFileSync('frontend/client/src/workspace/components/AssetManagementView.vue','utf8');const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/import .*?from 'vue';/,'');
 const context=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn();}}),nextTick:async()=>{},onMounted(){},onBeforeUnmount(){}});vm.runInContext(script,context);
 vm.runInContext("racks.value=[{id:'r1',name:'Rack 01'},{id:'r2',name:'Rack 02'}];placements.value=[{asset_id:'a',rack_id:'r1',start_unit:2,height:2}];placement.value={assetId:'a',rackId:'r2'};",context);
 assert.match(vm.runInContext("assetRackRemark('a')",context),/Rack 01.*U2-U3/);assert.match(vm.runInContext('placementSelectionError.value',context),/sudah dipakai/);
 vm.runInContext('install()',context);assert.match(vm.runInContext('message.value',context),/sudah dipakai/);
 vm.runInContext("placement.value.originalAssetId='a';placement.value.previousRackId='r1';",context);assert.equal(vm.runInContext('placementSelectionError.value',context),'');
 vm.runInContext("placement.value={assetId:'new',rackId:'r2'}",context);assert.equal(vm.runInContext('placementSelectionError.value',context),'');assert.equal(vm.runInContext("assetRackRemark('new')",context),'Belum dipasang');
});
