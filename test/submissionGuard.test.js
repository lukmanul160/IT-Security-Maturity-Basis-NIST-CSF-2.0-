const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/client/src/workspace/features/shared/submission-guard.js'), 'utf8');
function setup() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const attributes = new Map();
  const form = {
    elements: [{ type: 'submit', disabled: false }, { type: 'submit', disabled: true }],
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
  };
  const event = { currentTarget: form, preventDefault() {} };
  return { guard: context.guardFormSubmission, form, event };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
test('rapid submits send once and stay locked through follow-up writes', async () => {
  const { guard, form, event } = setup();
  const create = deferred(), details = deferred();
  let calls = 0;
  const submit = guard(async () => { calls++; await create.promise; await details.promise; });
  const first = submit(event);
  await submit(event);
  assert.equal(calls, 1);
  assert.equal(form.elements[0].disabled, true);
  create.resolve();
  await submit(event);
  assert.equal(calls, 1);
  assert.equal(form.getAttribute('aria-busy'), 'true');
  details.resolve();
  await first;
  assert.equal(form.elements[0].disabled, false);
  assert.equal(form.elements[1].disabled, true);
  assert.equal(form.getAttribute('aria-busy'), null);
  await submit(event);
  assert.equal(calls, 2);
});
test('separate handlers on one form share the same lock', async () => {
  const { guard, event } = setup();
  const waiting = deferred();
  let calls = 0;
  const first = guard(async () => { calls++; await waiting.promise; })(event);
  await guard(async () => { calls++; })(event);
  assert.equal(calls, 1);
  waiting.resolve();
  await first;
});
test('failure releases the lock so the user can retry', async () => {
  const { guard, form, event } = setup();
  form.setAttribute('aria-busy', 'false');
  let calls = 0;
  const submit = guard(async () => { if (++calls === 1) throw new Error('Network failed'); });
  await assert.rejects(submit(event), /Network failed/);
  assert.equal(form.elements[0].disabled, false);
  assert.equal(form.getAttribute('aria-busy'), 'false');
  await submit(event);
  assert.equal(calls, 2);
});
test('different forms can save independently', async () => {
  const { guard, event } = setup();
  const other = setup();
  const waiting = deferred();
  const first = guard(async () => { await waiting.promise; })(event);
  let saved = false;
  await guard(async () => { saved = true; })(other.event);
  assert.equal(saved, true);
  waiting.resolve();
  await first;
});
