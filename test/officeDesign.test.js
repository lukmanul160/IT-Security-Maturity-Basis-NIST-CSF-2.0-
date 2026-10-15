const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const service = require('../src/services/officeDesignService');
const permissions = require('../src/services/permissionService');
const { pool } = require('../src/config/database');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/office-design/shapes.js', 'utf8'), context);
const example = () => JSON.parse(JSON.stringify(context.officeExampleLayout()));
test('security objects and calibrated CCTV coverage persist and reject invalid settings', () => {
  const camera = { id:'camera-1', type:'cctv',x:20,y:20,width:45,height:30,rotation:45,label:'Lobby',coverageRange:8,coverageAngle:110,showCoverage:true };
  const input = { name:'Security plan',version:0,layout:{width:1000,height:800,unitsPerMeter:50,nodes:[camera]} };
  assert.deepEqual(service.validate(input).layout,input.layout);
  for(const change of [{coverageRange:-1},{coverageRange:101},{coverageAngle:360},{showCoverage:'yes'}])assert.throws(()=>service.validate({...input,layout:{...input.layout,nodes:[{...camera,...change}]}}),{status:400});
  assert.throws(()=>service.validate({...input,layout:{...input.layout,unitsPerMeter:0}}),{status:400});
  for(const type of ['access','alarm','extinguisher','smoke','exit','assembly'])assert.equal(service.validate({...input,layout:{...input.layout,nodes:[{...camera,type}]}}).layout.nodes[0].type,type);
  const svg = context.officeCctvCoverageSvg(camera,50);
  assert.match(svg,/8 m \/ 110/); assert.match(svg,/rotate\(45/);
  assert.equal(context.officeCctvCoverageSvg({...camera,showCoverage:false},50),'');
});
test('editable office example validates and rejects duplicate IDs, unknown shapes and out-of-bounds positions', () => {
  const layout = example();
  assert.ok(service.validate({ name: 'Kantor pusat', version: 0, layout }).layout.nodes.length > 30);
  for (const change of [{ x: -1 }, { width: 5000 }, { rotation: NaN }, { type: 'script' }]) {
    const broken = example(); Object.assign(broken.nodes[0], change);
    assert.throws(() => service.validate({ name: 'Office', version: 0, layout: broken }), { status: 400 });
  }
  layout.nodes.push({ ...layout.nodes[0] });
  assert.throws(() => service.validate({ name: 'Office', version: 0, layout }), { status: 400 });
});
test('new modules honor normal role actions', () => {
  for (const key of ['reporting-regulator', 'narahubung', 'office-design']) {
    assert.equal(permissions.canAccess('viewer', key, 'read'), true);
    assert.equal(permissions.canAccess('viewer', key, 'update'), false);
    assert.equal(permissions.canAccess('editor', key, 'create'), true);
    assert.equal(permissions.canAccess('editor', key, 'delete'), false);
    assert.equal(permissions.canAccess('approver', key, 'delete'), true);
  }
});
test('PostgreSQL office save preserves layout and rejects stale updates/deletes', async () => {
  const client = await pool.connect(), query = pool.query;
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE office_designs(id UUID PRIMARY KEY,name TEXT NOT NULL,layout JSONB NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    pool.query = (...args) => client.query(...args);
    const input = { name: 'Denah uji', version: 0, layout: example() };
    const saved = await service.save(null, input);
    assert.equal(saved.version, 1);
    assert.deepEqual((await service.read(saved.id)).layout, input.layout);
    const updated = await service.save(saved.id, { ...saved, name: 'Denah revisi' });
    assert.equal(updated.version, 2);
    await assert.rejects(service.save(saved.id, saved), { status: 409 });
    await assert.rejects(service.remove(saved.id, 1), { status: 409 });
    const second = await service.save(null, { name: 'Kanvas kedua', version: 0, layout: { width: 1000, height: 800, nodes: [] } });
    assert.notEqual(second.id, saved.id);
    assert.deepEqual((await service.read(saved.id)).layout, input.layout);
    assert.equal((await service.list()).length, 2);
    await service.remove(second.id, second.version);
    await service.remove(saved.id, 2);
    assert.equal((await service.list()).length, 0);
  } finally { pool.query = query; await client.query('ROLLBACK'); client.release(); }
});
test.after(() => pool.end());
