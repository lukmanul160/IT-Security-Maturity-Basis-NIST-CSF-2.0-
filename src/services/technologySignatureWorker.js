/** Evaluate a bounded page snapshot against locally pinned community patterns in an expendable worker. */
const { parentPort, workerData } = require('node:worker_threads');
const { load } = require('./technologySignatureService');
const rules = load();
const input = workerData;
const hits = new Map();
const list = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const own = (object, key) => (object && Object.hasOwn(object, key) ? object[key] : undefined);
const safeVersion = (value) => (/^(?:\d[\w.+-]{0,99}|GA4|UA)$/.test(value || '') ? value : '');
function pattern(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  const [expression, ...metadata] = raw.split('\\;');
  const attributes = Object.fromEntries(
    metadata.map((value) => {
      const colon = value.indexOf(':');
      return [value.slice(0, colon), value.slice(colon + 1)];
    }),
  );
  try {
    return {
      regex: new RegExp(expression, 'i'),
      version: attributes.version || '',
      confidence:
        attributes.confidence === undefined
          ? 100
          : Math.max(0, Math.min(100, Number(attributes.confidence) || 0)),
    };
  } catch {
    return null;
  }
}
function add(name, version, confidence, evidence, inferred = false) {
  const hit = hits.get(name) || { name, versions: new Set(), confidence: 0, evidence: new Set(), inferred };
  if (version) hit.versions.add(version);
  if (!hit.evidence.has(evidence)) hit.confidence = Math.min(100, hit.confidence + confidence);
  hit.evidence.add(evidence);
  if (!inferred) hit.inferred = false;
  hits.set(name, hit);
}
function match(name, raw, values, evidence) {
  for (const text of list(raw)) {
    const parsed = pattern(text);
    if (!parsed) continue;
    for (const value of list(values)) {
      if (value === undefined || value === null) continue;
      const result = parsed.regex.exec(String(value));
      if (!result) continue;
      const template = parsed.version.replace(/\\(\d+)\?([^:]*):([^\\]*)/g, (_, index, yes, no) =>
        result[Number(index)] ? yes : no,
      );
      const version = safeVersion(template.replace(/\\(\d+)/g, (_, index) => result[Number(index)] || ''));
      add(name, version, parsed.confidence, evidence);
      break;
    }
  }
}
for (const [name, definition] of Object.entries(rules.technologies)) {
  for (const field of ['url', 'html', 'css', 'scripts', 'scriptSrc', 'xhr'])
    match(name, definition[field], input[field], field);
  for (const field of ['headers', 'cookies', 'meta', 'js'])
    for (const [key, patterns] of Object.entries(definition[field] || {})) {
      let values = own(input[field], field === 'js' ? key : key.toLowerCase());
      if (field === 'cookies' && key.includes('*')) {
        const expression = key
          .toLowerCase()
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        const wildcard = new RegExp('^' + expression + '$');
        values = Object.entries(input.cookies || {})
          .filter(([name]) => wildcard.test(name))
          .map(([, value]) => value);
      }
      match(name, patterns, values, field + ': ' + key);
    }
  const definitions =
    typeof definition.dom === 'string'
      ? { [definition.dom]: { exists: '' } }
      : Array.isArray(definition.dom)
        ? Object.fromEntries(definition.dom.map((selector) => [selector, { exists: '' }]))
        : definition.dom || {};
  for (const [selector, raw] of Object.entries(definitions)) {
    for (const element of list(own(input.dom, selector)))
      for (const rule of list(raw)) {
        if (Object.hasOwn(rule, 'exists')) match(name, rule.exists, 'true', 'DOM selector');
        if (Object.hasOwn(rule, 'text')) match(name, rule.text, element.text, 'DOM text');
        for (const field of ['attributes', 'properties'])
          for (const [key, patterns] of Object.entries(rule[field] || {}))
            match(name, patterns, own(element[field], key), 'DOM ' + field + ': ' + key);
      }
  }
}
// Conditional detections are pruned before and after implication expansion.
function requirements() {
  for (const [name] of hits) {
    const definition = rules.technologies[name];
    if (
      list(definition.requires).some((value) => !hits.has(value)) ||
      list(definition.requiresCategory).some(
        (category) =>
          ![...hits.keys()].some((key) => list(rules.technologies[key].cats).includes(Number(category))),
      )
    )
      hits.delete(name);
  }
}
requirements();
for (let iteration = 0; iteration < 10; iteration++) {
  let changed = false;
  for (const [name, hit] of [...hits])
    for (const raw of list(rules.technologies[name].implies)) {
      const [implied, ...metadata] = raw.split('\\;');
      if (!rules.technologies[implied] || hits.has(implied)) continue;
      const confidence = Number(
        metadata.find((value) => value.startsWith('confidence:'))?.slice(11) || hit.confidence,
      );
      add(implied, '', Math.min(hit.confidence, confidence), 'Implied by ' + name, true);
      changed = true;
    }
  if (!changed) break;
}
requirements();
const excluded = new Set(),
  results = [];
for (const hit of [...hits.values()].sort(
  (a, b) =>
    Number(a.inferred) - Number(b.inferred) ||
    b.confidence - a.confidence ||
    b.versions.size - a.versions.size ||
    a.name.localeCompare(b.name),
)) {
  if (excluded.has(hit.name) || hit.confidence <= 0) continue;
  const definition = rules.technologies[hit.name];
  for (const name of list(definition.excludes)) excluded.add(name);
  const categories = list(definition.cats)
    .map((id) => rules.categories[id]?.name)
    .filter(Boolean)
    .slice(0, 10);
  const names = categories.join(' ').toLowerCase();
  const quadrant = /database|storage/.test(names)
    ? 'data'
    : /framework|programming|javascript librar/.test(names)
      ? 'framework'
      : /cms|server|operating|platform|ecommerce|hosting|cdn/.test(names)
        ? 'platform'
        : 'tool';
  for (const version of hit.versions.size ? [...hit.versions].slice(0, 5) : [''])
    results.push({
      name: hit.name,
      version,
      quadrant,
      ring: 'assess',
      source: 'scan',
      evidence: [...hit.evidence]
        .map((value) => 'Community signature: ' + value)
        .join('; ')
        .slice(0, 1000),
      notes: '',
      detection: {
        engine: 'WebAppAnalyzer (Wappalyzer-compatible)',
        confidence: hit.confidence,
        inferred: hit.inferred,
        description: String(definition.description || '').slice(0, 1000),
        categories,
      },
    });
}
parentPort.postMessage({
  technologies: results.slice(0, 100),
  partial: false,
  engine: { name: 'WebAppAnalyzer', revision: rules.revision, signatures: rules.count, license: 'GPL-3.0' },
});
