const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load(query = async () => { throw new Error('Unexpected write'); }) {
  const context = vm.createContext({ module: { exports: {} }, require: name => name.endsWith('threatStencils.json') ? require('../src/shared/threatStencils.json') : ({ pool: { query } }) });
  vm.runInContext(fs.readFileSync('src/services/threatModelService.js', 'utf8'), context);
  return context.module.exports;
}
function sample() {
  const node = id => ({ id, type: 'process', label: 'API', x: 100, y: 100, width: 160, height: 80, color: '#dbeafe', description: '', threats: [] });
  return { name: 'Application', diagram: { nodes: [node('a'), node('b')], edges: [{ id: 'flow', source: 'a', target: 'b', label: 'HTTPS', description: '', threats: [] }] } };
}
test('validates diagrams and STRIDE threats before database writes', () => {
  const model = sample(); model.diagram.nodes[0].threats.push({ id: 'threat', title: 'Unauthorized access', category: 'Spoofing', severity: 'High', status: 'Open', mitigation: 'MFA' });
  assert.equal(load().validate(model), model);
  model.diagram.nodes[0].threats[0].category = 'Unknown'; assert.throws(() => load().validate(model), /STRIDE/);
});
test('rejects duplicate IDs, dangling edges, non-finite coordinates and invalid shapes', async () => {
  for (const mutate of [m => m.diagram.nodes[1].id = 'a', m => m.diagram.edges[0].target = 'missing', m => m.diagram.nodes[0].x = Infinity, m => m.diagram.nodes[0].width = 0, m => m.diagram.nodes[0].type = 'script']) {
    const model = sample(); mutate(model); await assert.rejects(load().create(model));
  }
});
test('saves complete diagrams as parameterized JSONB, retaining threat annotations', async () => {
  const calls = []; const api = load(async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 1 }], rowCount: 1 }; });
  const model = sample(); await api.create(model);
  assert.deepEqual(JSON.parse(calls[0].values[1]), model.diagram);
  assert.match(calls[0].sql, /\$2::jsonb/);
});
test('optimistic version check prevents overwriting another editor', async () => {
  const model = { ...sample(), version: 2 }; const calls = [];
  const api = load(async (sql, values) => { calls.push({ sql, values }); return { rows: [], rowCount: 0 }; });
  await assert.rejects(api.update('7', model), error => error.status === 409);
  assert.match(calls[0].sql, /AND version=\$4/); assert.equal(calls[0].values[3], 2);
});
test('empty diagrams are valid and missing versions cannot update stored records', async () => {
  const api = load(); api.validate({ name: 'Empty', diagram: { nodes: [], edges: [] } });
  await assert.rejects(api.update('1', sample()), /Versi/);
});

test('unbounded diagrams support negative coordinates and content beyond legacy canvas dimensions', () => {
  const model = sample(); model.diagram.canvas = { width: 4000, height: 3000 };
  model.diagram.nodes[0].x = -20000; model.diagram.nodes[0].y = 50000;
  assert.equal(load().validate(model), model);
  model.diagram.canvas.width = 12001; assert.equal(load().validate(model), model);
  model.diagram.canvas.width = Infinity; assert.throws(() => load().validate(model), /canvas/);
});

test('stencil properties persist and invalid types or values are rejected', async () => {
  const stencils = require('../src/shared/threatStencils.json');
  for (const stencil of stencils) {
    const model = sample();
    const item = stencil.type === 'flow' ? model.diagram.edges[0] : model.diagram.nodes[0];
    if (stencil.type !== 'flow') item.type = stencil.type;
    Object.assign(item, { stencilId: stencil.id, properties: Object.fromEntries(stencil.properties.map(property => [property.key, property.default])), outOfScope: false, reasonOutOfScope: '' });
    const api = load(async (sql, values) => { assert.deepEqual(JSON.parse(values[1]), model.diagram); return { rows: [{ id: 1 }] }; });
    await api.create(model);
  }
  const model = sample(); model.diagram.nodes[0].stencilId = 'GE.DF';
  assert.throws(() => load().validate(model), /Stencil/);
  model.diagram.nodes[0].stencilId = 'GE.P'; model.diagram.nodes[0].properties = { codeType: 'bad' };
  assert.throws(() => load().validate(model), /property/);
});
