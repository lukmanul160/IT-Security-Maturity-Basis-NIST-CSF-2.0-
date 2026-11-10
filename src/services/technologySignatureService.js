/** Project-owned technology observations; no external rule database or API. */
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const definitions = require('../shared/technologyRules');
function load() {
  return { technologies: definitions, revision: 'nist-basis-1', count: definitions.length };
}
/** Build data-only read plans; selectors and JS paths are never evaluated as JavaScript code. */
function browserPlan() {
  const js = new Set(),
    dom = new Map();
  for (const definition of definitions) {
    for (const observation of definition.observations) {
      if (observation.field === 'js') js.add(observation.key);
      if (observation.field !== 'dom') continue;
      const entry = dom.get(observation.key) || { selector: observation.key, attributes: new Set(), properties: new Set() };
      if (observation.attribute) entry.attributes.add(observation.attribute);
      dom.set(observation.key, entry);
    }
  }
  return {
    js: [...js],
    dom: [...dom.values()].map((entry) => ({
      selector: entry.selector,
      attributes: [...entry.attributes],
      properties: [...entry.properties],
    })),
  };
}
/** Regex evaluation is isolated and terminable, including catastrophic patterns on hostile pages. */
function analyze(input) {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'technologySignatureWorker.js'), {
      workerData: input,
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      resolve(result);
    };
    const timer = setTimeout(() => finish({ technologies: [], partial: true }), 6000);
    worker.once('message', finish);
    worker.once('error', () => finish({ technologies: [], partial: true }));
    worker.once('exit', () => finish({ technologies: [], partial: true }));
  });
}
module.exports = { load, browserPlan, analyze };
