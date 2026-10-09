const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/client/src/workspace/components/AssetManagementView.vue','utf8');
function setup(request){const c=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn();}}),nextTick:async()=>{},onMounted(){},onBeforeUnmount(){},fetch:async()=>({ok:true,json:async()=>({role:'admin'})})});vm.runInContext(source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/import .*?from 'vue';/,''),c);c.request=request;vm.runInContext("api=request;view.value='server-racks'",c);return c;}
test('photo API failure does not hide racks or their placements',async()=>{
 const c=setup(async kind=>{if(kind==='photos')throw Error('Route not found');return {racks:[{id:'r',units:42}],placements:[{asset_id:'a',rack_id:'r',start_unit:1,height:2}],catalog:[{id:'a',name:'Firewall'}]}[kind];});
 await vm.runInContext('load()',c);assert.equal(vm.runInContext('rack.value.units',c),42);assert.equal(vm.runInContext('rackDevices.value.length',c),1);assert.equal(vm.runInContext('assets.value.length',c),1);assert.equal(vm.runInContext('photoCatalog.value.assets.length',c),0);assert.match(vm.runInContext('message.value',c),/Data rak berhasil dimuat/);assert.equal(vm.runInContext('busy.value',c),false);
});
test('reloading selects first available rack and prevents concurrent requests',async()=>{
 let requests=0;const c=setup(async kind=>{requests++;return {racks:[{id:'r',units:12}],placements:[],catalog:[],photos:{assets:[],racks:[]}}[kind];});
 vm.runInContext("selectedRack.value='deleted'",c);await Promise.all([vm.runInContext('load()',c),vm.runInContext('load()',c)]);assert.equal(requests,4);assert.equal(vm.runInContext('selectedRack.value',c),'r');
});
test('saved rack page is restored after workspace initialization',()=>{
 const c=setup(async()=>[]);c.localStorage={getItem:()=>JSON.stringify({view:'server-racks'})};const opened=[];c.openPage=key=>opened.push(key);vm.runInContext('open=openPage;restoreAssetView()',c);assert.deepEqual(opened,['server-racks']);
 const runtime=fs.readFileSync('frontend/client/src/workspace/features/shared/event-bindings.js','utf8');assert.match(runtime,/\['asset-register','server-racks','asset-modelling'\]\.includes\(uiState.view\)/);
});
