const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(overrides = {}) {
  const calls = [];
  const context = vm.createContext({
    $: () => ({ classList: { contains: () => false } }),
    ...Object.fromEntries(['loadDefaultFile', 'loadCsfData', 'loadPrivacyData', 'loadIso27001Data', 'loadIso27001SoaData', 'loadPolicyRegisterRows', 'refreshEvidenceLibrary', 'renderUploadedFiles']
      .map(name => [name, async () => { calls.push(name); return true; }])),
    ...overrides,
  });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/module-loading.js', 'utf8'), context);
  return { calls, load: view => context.ensureModuleData(view) };
}

test('unrelated modules do not fetch assessment data; concurrent assessment entry shares a load', async () => {
  const { calls, load } = setup();
  await load('monitoring-dashboard');
  await load('reporting-regulator');
  assert.deepEqual(calls, []);
  await Promise.all([load('csf'), load('assessment'), load('csf-manage')]);
  assert.deepEqual(calls, ['loadDefaultFile', 'loadCsfData']);
  await load('privacy');
  assert.deepEqual(calls, ['loadDefaultFile', 'loadCsfData', 'loadPrivacyData']);
});

test('failed initial data can be retried when reopening a module', async () => {
  let attempts = 0;
  const { calls, load } = setup({ loadDefaultFile: async () => ++attempts > 1 });
  await assert.rejects(load('assessment'), /database unavailable/);
  await load('assessment');
  assert.equal(attempts, 2);
  assert.deepEqual(calls, ['loadCsfData']);
});

test('the file library loads its cross-framework sources only when requested', async () => {
  const { calls, load } = setup();
  assert.deepEqual(calls, []);
  await load('files');
  for (const name of ['loadCsfData', 'loadPrivacyData', 'loadIso27001Data', 'loadIso27001SoaData', 'loadPolicyRegisterRows', 'refreshEvidenceLibrary']) {
    assert.equal(calls.filter(call => call === name).length, 1, name);
  }
  const count = calls.length;
  await load('files');
  assert.equal(calls.length, count);
});
