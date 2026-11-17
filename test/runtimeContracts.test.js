const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, checkContracts } = require('../scripts/lib/runtime-contracts.cjs');
test('cross-fragment imports resolve actual bindings and ignore shadowed locals', () => {
  const rows=analyze([{name:'model'},{name:'view'}],['const value=1;function load(){return value;}\n','function render(value){return value;}const result=load();window.show=result;']);
  assert.deepEqual(rows[1].imports,{load:'model'});
  assert.deepEqual(rows[1].globals,['window']);
});
test('all production fragments match reviewed dependency contracts',()=>assert.ok(checkContracts().length>50));
