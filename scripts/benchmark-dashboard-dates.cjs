// Execute the real classic-script date helpers in a VM; no DOM or database.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const cases = [
  ['risk-management/dashboard.js', 'function rdSetDrill', 'rdDate(value)'],
  ['risk-acceptance/dashboard.js', 'function raPopulateFilters', 'raDate(value)'],
  ['shared/governance-dashboard.js', 'function gdOptions', 'gdDays(value)'],
];
const results = [];
for (const [file, end, expression] of cases) {
  const sourcePath = 'frontend/client/src/workspace/features/' + file;
  for (const version of ['before', 'after']) {
    const source = version === 'before' ? execFileSync('git', ['show', 'HEAD:' + sourcePath], { encoding: 'utf8', windowsHide: true }) : fs.readFileSync(sourcePath, 'utf8');
    const context = vm.createContext({ Intl, Date, value: '2026-09-30T18:00:00Z' });
    vm.runInContext(source.slice(0, source.indexOf(end)), context);
    const times = [];
    const run = new vm.Script(`for(let i=0;i<100;i++) { ${expression}; }`);
    for (let i = 0; i < 6; i++) { const start = performance.now(); run.runInContext(context); if (i) times.push(performance.now() - start); }
    times.sort((a, b) => a - b);
    const output = vm.runInContext(expression, context);
    results.push({ file, version, calls: 100, medianMs: times[2], output });
    console.log(`${file} ${version}: ${times[2].toFixed(2)}ms / 100 calls`);
  }
  assert.equal(results.at(-1).output, results.at(-2).output);
}
fs.mkdirSync('output', { recursive: true });
fs.writeFileSync('output/dashboard-date-performance.json', JSON.stringify({ node: process.version, scope: 'VM helper CPU only; five timed samples, one warmup; identical outputs verified', results }, null, 2));
