const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function service(query) {
  const context = vm.createContext({ module: { exports: {} }, require: name => name === '../config/database' ? { pool: { query } } : name === '../config/paths' ? {} : { promises: {} } });
  vm.runInContext(fs.readFileSync('src/services/riskManagementService.js', 'utf8'), context); return context.module.exports;
}
test('dropdown synchronization preserves persisted IDs for referenced register values', () => {
  const context = vm.createContext({ riskDropdowns: [{ id: 12, fieldName: 'deviceName', optionValue: 'Server', sortOrder: 1 }], riskManagementRows: [{ deviceName: 'Server' }, { deviceName: 'Imported device' }] });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/risk-management/register.js', 'utf8') + '\nsynchronizeRiskDropdowns();', context);
  assert.equal(context.riskDropdowns.find(row => row.optionValue === 'Server').id, 12);
  assert.equal(context.riskDropdowns.find(row => row.optionValue === 'Imported device').id, 0);
});
test('dropdown listing keeps real IDs instead of zero from register references', async () => {
  let statement;
  await service(async sql => { statement = sql; return { rows: [] }; }).listDropdowns();
  assert.match(statement, /MIN\(NULLIF\(id, 0\)\)/);
});
test('invalid fields, empty labels and invalid ordering are rejected before writes', async () => {
  const api = service(async () => { throw new Error('Unexpected query'); });
  for (const data of [{ fieldName: 'unknown', optionValue: 'x' }, { fieldName: 'riskCategory', optionValue: ' ' }, { fieldName: 'deviceName', optionValue: 'Server', sortOrder: -1 }, { fieldName: 'effectedAsset', optionValue: 'Asset', sortOrder: 1.5 }]) await assert.rejects(api.createDropdown(data), error => error.status === 400);
});
test('duplicate dropdown values return a useful conflict error', async () => {
  await assert.rejects(service(async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); }).createDropdown({ fieldName: 'deviceName', optionValue: 'Server' }), error => error.status === 409 && /sudah tersedia/.test(error.message));
});
test('referenced options cannot be renamed or deleted; ordering can still change', async () => {
  const calls = [];
  const api = service(async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT *')) return { rowCount: 1, rows: [{ id: 3, field_name: 'riskCategory', option_value: 'Technical' }] };
    if (sql.startsWith('SELECT 1')) return { rowCount: 1, rows: [{}] };
    if (sql.startsWith('UPDATE')) return { rowCount: 1, rows: [{ id: 3 }] };
    throw new Error('Unexpected destructive query');
  });
  await assert.rejects(api.removeDropdown(3), error => error.status === 409);
  await assert.rejects(api.updateDropdown(3, { fieldName: 'riskCategory', optionValue: 'Renamed' }), error => error.status === 409);
  assert.equal((await api.updateDropdown(3, { fieldName: 'riskCategory', optionValue: 'Technical', sortOrder: 2 })).id, 3);
  assert.ok(!calls.some(sql => sql.startsWith('DELETE')));
});
