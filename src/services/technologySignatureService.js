/** Local Wappalyzer-format community rules; no target data is sent to an external API. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Worker } = require('node:worker_threads');
let snapshot;
function load() {
  if (snapshot) return snapshot;
  const root = path.resolve(__dirname, '../../third_party/webappanalyzer');
  const source = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE.json'), 'utf8'));
  const technologies = {};
  let categories;
  for (const [filename, hash] of Object.entries(source.files)) {
    if (!/^src\/(categories\.json|technologies\/[a-z_]\.json)$/.test(filename)) continue;
    const buffer = fs.readFileSync(path.join(root, filename));
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== hash)
      throw Error('Technology signature integrity mismatch');
    const value = JSON.parse(buffer);
    if (filename === 'src/categories.json') categories = value;
    else Object.assign(technologies, value);
  }
  snapshot = { technologies, categories, revision: source.revision, count: Object.keys(technologies).length };
  return snapshot;
}
/** Build data-only read plans; selectors and JS paths are never evaluated as JavaScript code. */
function browserPlan() {
  const js = new Set(),
    dom = new Map();
  for (const definition of Object.values(load().technologies)) {
    for (const key of Object.keys(definition.js || {})) if (key.length <= 300) js.add(key);
    const definitions =
      typeof definition.dom === 'string'
        ? { [definition.dom]: { exists: '' } }
        : Array.isArray(definition.dom)
          ? Object.fromEntries(definition.dom.map((selector) => [selector, { exists: '' }]))
          : definition.dom || {};
    for (const [selector, raw] of Object.entries(definitions)) {
      if (selector.length > 1000) continue;
      const entry = dom.get(selector) || { selector, attributes: new Set(), properties: new Set() };
      for (const rule of Array.isArray(raw) ? raw : [raw]) {
        for (const key of Object.keys(rule.attributes || {})) entry.attributes.add(key);
        for (const key of Object.keys(rule.properties || {})) entry.properties.add(key);
      }
      dom.set(selector, entry);
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
