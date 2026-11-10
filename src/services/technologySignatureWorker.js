/** Evaluate project-owned rules in a bounded, terminable worker. */
const { parentPort, workerData: input } = require('node:worker_threads');
const { load } = require('./technologySignatureService');
const rules = load();
const hits = new Map();
const list = value => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const own = (value, key) => value && Object.hasOwn(value, key) ? value[key] : undefined;
for (const definition of rules.technologies) {
  for (const observation of definition.observations) {
    let values = observation.key ? own(input[observation.field], observation.key) : input[observation.field];
    if (observation.field === 'dom') values = list(values).map(element => observation.attribute ? own(element.attributes, observation.attribute) : 'present');
    for (const value of list(values)) {
      if (value === undefined || value === null || value === false || value === '') continue;
      const match = observation.pattern ? observation.pattern.exec(String(value).slice(0, 512 * 1024)) : [];
      if (!match) continue;
      const candidate = observation.version || (observation.versionGroup ? match[observation.versionGroup] : '') || '';
      const version = /^(?:\d[\w.+-]{0,99}|GA4|UA)$/.test(candidate) ? candidate : '';
      const hit = hits.get(definition.name) || { definition, versions: new Set(), evidence: new Set(), inferred: false };
      if (version) hit.versions.add(version);
      hit.evidence.add('Local observation: ' + observation.field + (observation.key ? ': ' + observation.key : ''));
      hits.set(definition.name, hit);
    }
  }
}
for (const [name, hit] of [...hits]) {
  for (const implied of hit.definition.implies) {
    const definition = rules.technologies.find(rule => rule.name === implied);
    if (definition && !hits.has(implied)) hits.set(implied, { definition, versions: new Set(), evidence: new Set(['Implied by ' + name]), inferred: true });
  }
}
const technologies = [];
for (const [name, hit] of hits) {
  const categories = hit.definition.categories;
  const quadrant = /framework|JavaScript librar/.test(categories.join(' ')) ? 'framework' : /CDN/.test(categories.join(' ')) ? 'platform' : 'tool';
  for (const version of hit.versions.size ? [...hit.versions].slice(0, 5) : ['']) technologies.push({
    name, version, quadrant, ring: 'assess', source: 'scan', notes: '', evidence: [...hit.evidence].join('; ').slice(0, 1000),
    detection: { engine: 'NIST Basis', confidence: hit.inferred ? 80 : 100, inferred: hit.inferred, description: hit.definition.description, categories },
  });
}
parentPort.postMessage({ technologies: technologies.slice(0, 100), partial: false, engine: { name: 'NIST Basis', revision: rules.revision, signatures: rules.count } });
