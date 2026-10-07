const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/client/src/workspace/components/ThreatModellingView.vue','utf8');

test('fit uses visible viewport measurements and ignores a hidden viewport', () => {
  let bounds = {width:0,height:0};
  const context = vm.createContext({viewport:{value:{getBoundingClientRect:()=>bounds}},viewSize:{value:{width:1,height:1}},model:{value:{diagram:{nodes:[{x:100,y:100,width:200,height:100}]}}},zoom:{value:1},camera:{value:{x:0,y:0}}});
  vm.runInContext(source.slice(source.indexOf('function setZoom('),source.indexOf('function keyboard(')), context);
  vm.runInContext('fit()',context);
  assert.equal(context.zoom.value,1);
  bounds = {width:900,height:600};
  vm.runInContext('fit()',context);
  assert.equal(context.zoom.value,1);
  assert.equal(context.viewSize.value.width,900);
  assert.equal(context.camera.value.x,40);
});

test('reloading selects saved data after an empty initial load and preserves unsaved edits', async () => {
  let records = [];
  const context = vm.createContext({loading:{value:false},loadError:{value:''},status:{value:''},access:{value:{}},models:{value:[]},loaded:{value:false},dirty:{value:false},model:{value:{diagram:{nodes:[]}}},clone:value=>structuredClone(value),document:{querySelector:()=>null},nextTick:()=>{},request:async url=>url==='/api/auth/me'?{role:'admin'}:records});
  vm.runInContext(source.slice(source.indexOf('async function load()'),source.indexOf('function reset(')),context);
  await vm.runInContext('load()',context);
  records = [{id:'2',name:'Saved diagram',diagram:{nodes:[{id:'a'}],edges:[]}}];
  await vm.runInContext('load()',context);
  assert.equal(context.model.value.name,'Saved diagram');
  context.dirty.value = true;
  context.model.value.name = 'Unsaved local changes';
  await vm.runInContext('load()',context);
  assert.equal(context.model.value.name,'Unsaved local changes');
});
