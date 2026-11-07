const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSource, runtimeParts } = require('../scripts/lib/source-catalog.cjs');
const { implicitButtons, checkStructure } = require('../scripts/check-structure.cjs');

test('all application sources and Vue buttons satisfy the shared structure contract', () => {
  const catalog = checkStructure();
  assert.ok(catalog.files.length > 0);
  assert.equal(new Set(catalog.runtime.map(part => part.path)).size, catalog.runtime.length);
});

test('catalog parses real declarations, defaults and dependencies without executing code', () => {
  const source = `const fake = 'function invented() {}'; // function alsoFake() {}
    const fs = require('node:fs');
    /**
     * Saved-state calculation.
     * Additional detail stays outside the one-line catalog summary.
     */
    async function calculate(data = {}) { throw new Error('must not run'); }
    const render = (value) => value;`;
  const result = analyzeSource(source, 'fixture.js');
  assert.deepEqual(result.functions.map(fn => fn.name), ['calculate', 'render']);
  assert.deepEqual(result.functions[0].parameters, ['data = {}']);
  assert.match(result.functions[0].description, /Saved-state/);
  assert.deepEqual(result.dependencies, ['node:fs']);
  assert.deepEqual(analyzeSource(source.replaceAll('\n', '\r\n'), 'fixture.js'), result);
});

test('Vue function locations refer to original SFC lines', () => {
  const result = analyzeSource('<template><p>Hi</p></template>\n<script setup>\nfunction save() {}\n</script>', 'fixture.vue');
  assert.equal(result.functions[0].line, 3);
});

test('runtime follows assembly order, not import order, and rejects missing bindings', () => {
  const runtime = `import first from './features/a.js?raw'; import second from './features/b.js?raw'; export default [second,first,].join('');`;
  assert.deepEqual(runtimeParts(runtime).map(part => part.name), ['second', 'first']);
  assert.throws(() => runtimeParts(runtime.replace('[second,first,]', '[missing]')), /no raw import/);
});

test('button audit distinguishes form submission, shortcuts and explicit dynamic types', () => {
  const issues = implicitButtons(`<template><form @submit.prevent="save"><button>Save</button><button @click="cancel">Cancel</button><button :type="kind">Custom</button></form><button :disabled="count > 0">Open</button></template>`, 'fixture.vue');
  assert.deepEqual(issues.map(issue => issue.intendedType), ['submit', 'button', 'button']);
});

test('v-pre buttons and explicit submit types follow the same audit contract', () => {
  const issues = implicitButtons('<template><section v-pre><form><button type="submit">Save</button><button type="button">Cancel</button></form></section></template>', 'fixture.vue');
  assert.deepEqual(issues, []);
});
