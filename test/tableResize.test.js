const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync('frontend/client/src/services/tableResize.js','utf8').replace(/^export /gm,''),context);
const cell=(name,colSpan=1,rowSpan=1)=>({name,colSpan,rowSpan});
test('flat list headers map each resize boundary to its own column',()=>{
  const a=cell('Title'),b=cell('Owner'),c=cell('Actions');
  const layout=context.tableHeaderLayout({tHead:{rows:[{cells:[a,b,c]}]}});
  assert.equal(layout.count,3);assert.equal(layout.boundaries.get(0),a);assert.equal(layout.boundaries.get(2),c);
});
test('merged headers preserve separate leaf column boundaries and rowspan columns',()=>{
  const group=cell('Assessment',2),action=cell('Actions',1,2),a=cell('Policy'),b=cell('Practice');
  const layout=context.tableHeaderLayout({tHead:{rows:[{cells:[group,action]},{cells:[a,b]}]}});
  assert.equal(layout.count,3);assert.equal(layout.boundaries.get(0),a);assert.equal(layout.boundaries.get(1),b);assert.equal(layout.boundaries.get(2),action);assert.equal(layout.grid[1][2],action);
});
test('leading rowspans do not shift subsequent column identities',()=>{
  const id=cell('ID',1,2),group=cell('Scores',2),a=cell('Inherent'),b=cell('Residual');
  const layout=context.tableHeaderLayout({tHead:{rows:[{cells:[id,group]},{cells:[a,b]}]}});
  assert.equal(layout.count,3);assert.equal(layout.boundaries.get(0),id);assert.equal(layout.boundaries.get(1),a);assert.equal(layout.boundaries.get(2),b);
});

test('hidden columns do not offset the visible resize boundaries',()=>{
  const title=cell('Title'),owner=cell('Owner'),status={...cell('Status'),hidden:true},due={...cell('Due'),style:{display:'none'}},details=cell('Details'),action=cell('Action');
  const layout=context.tableHeaderLayout({tHead:{rows:[{cells:[title,owner,status,due,details,action]}]}});
  assert.equal(layout.count,4);assert.equal(layout.boundaries.get(2),details);assert.equal(layout.boundaries.get(3),action);
  status.hidden=false;const expanded=context.tableHeaderLayout({tHead:{rows:[{cells:[title,owner,status,due,details,action]}]}});
  assert.equal(expanded.count,5);assert.equal(expanded.boundaries.get(3),details);
});
