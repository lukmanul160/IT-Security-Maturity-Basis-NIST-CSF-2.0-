const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const source=fs.readFileSync('frontend/client/src/workspace/components/AssetManagementView.vue','utf8');
 const c=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn();}}),nextTick:async()=>{},onMounted(){},onBeforeUnmount(){}});
 vm.runInContext(source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/import .*?from 'vue';/,''),c);
 vm.runInContext(`assets.value=[{id:'a',tag:'A',name:'Server',type:'Server',status:'planned',owner:'Alice',assetAssessment:{confidentiality:1,integrity:1,availability:1,likelihood:1}},{id:'b',tag:'B',name:'Firewall',type:'Firewall',status:'in-use',owner:'Bob',managedVendorId:'10',managedVendorName:'Vendor IT',renewalDate:'1900-01-01',reminderDays:30,assetAssessment:{confidentiality:5,integrity:4,availability:3,likelihood:4}},{id:'c',tag:'C',name:'Backup',type:'Server',status:'maintenance',owner:'Bob',assetAssessment:{confidentiality:3,integrity:2,availability:1,likelihood:2}}];racks.value=[{id:'r1',name:'Rack Jakarta',location:'Jakarta',units:12},{id:'r2',name:'Rack Bandung',location:'Bandung',units:42}];selectedRack.value='r1';placements.value=[{asset_id:'a',rack_id:'r1',start_unit:1,height:2,facing:'front',full_depth:true},{asset_id:'b',rack_id:'r1',start_unit:3,height:1,facing:'rear',full_depth:false}];relations.value=[{id:'one',source_id:'a',target_id:'b',type:'protects',notes:'Security',change_reference:'CHG-1'},{id:'two',source_id:'b',target_id:'c',type:'connects-to',notes:'Network',change_reference:''}];`,c);
 return c;
}
const count=(c,expression)=>vm.runInContext(expression+'.value.length',c);
test('asset filters combine CIA, owner, vendor, renewal and search and reset without changing source order',()=>{
 const c=setup();assert.equal(count(c,'visibleAssets'),3);
 vm.runInContext("assetFilters.value={type:'Firewall',status:'in-use',risk:'high',owner:'Bob',vendor:'10',renewal:'overdue'};search.value='Vendor IT';",c);assert.equal(count(c,'visibleAssets'),1);
 vm.runInContext("assetFilters.value.risk='low'",c);assert.equal(count(c,'visibleAssets'),0);
 vm.runInContext('resetAssetFilters()',c);assert.equal(count(c,'visibleAssets'),3);assert.equal(vm.runInContext('visibleAssets.value[0].id',c),'a');
});
test('rack/device filters preserve selection, occupancy and diagram data',()=>{
 const c=setup();vm.runInContext("rackLocationFilter.value='Bandung'",c);assert.equal(count(c,'filteredRacks'),1);assert.equal(vm.runInContext('rack.value.id',c),'r1');
 vm.runInContext("deviceFacingFilter.value='rear';deviceDepthFilter.value='single';deviceSearch.value='firewall'",c);assert.equal(count(c,'filteredRackDevices'),1);assert.equal(count(c,'rackDevices'),2);assert.equal(vm.runInContext('usedUnits.value',c),3);
 vm.runInContext('resetRackFilters();resetDeviceFilters()',c);assert.equal(count(c,'filteredRacks'),2);assert.equal(count(c,'filteredRackDevices'),2);
});
test('relation filters search both endpoints and notes and combine type with related asset',()=>{
 const c=setup();vm.runInContext("relationSearch.value='chg-1';relationTypeFilter.value='protects';relationAssetFilter.value='b'",c);assert.equal(count(c,'filteredRelations'),1);
 vm.runInContext("relationAssetFilter.value='c'",c);assert.equal(count(c,'filteredRelations'),0);assert.equal(count(c,'relations'),2);
 vm.runInContext('resetRelationFilters()',c);assert.equal(count(c,'filteredRelations'),2);
 vm.runInContext("diagramTypeFilter.value='Firewall';placementTypeFilter.value='Server'",c);assert.equal(count(c,'diagramPalette'),1);assert.equal(count(c,'placementAssets'),2);
});
