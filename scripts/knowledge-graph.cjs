/** Repository memory: static source/doc graph; never loads app, dotenv or operational data. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { projectRoot, sourceFiles, buildCatalog } = require('./lib/source-catalog.cjs');
const output = 'docs/knowledge-graph.json';
const read = file => fs.readFileSync(path.join(projectRoot, file), 'utf8').replace(/\r\n/g, '\n');
function walk(dir, pattern) {
  return fs.readdirSync(path.join(projectRoot, dir), { withFileTypes: true }).flatMap(entry => {
    const file = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(file, pattern) : pattern.test(file) ? [file] : [];
  });
}
function inputs() {
  return [...new Set([...sourceFiles(), ...walk('src', /README\.md$/),
    ...walk('frontend/client/src', /README\.md$/), ...walk('docs', /\.md$/), ...walk('database', /\.sql$/),
    ...walk('test', /\.(js|cjs|mjs)$/), ...walk('scripts', /\.(js|cjs|mjs)$/),
    'AGENTS.md', 'README.md', 'package.json', 'frontend/client/src/workspace/runtime-parts.json'])].sort();
}
function fingerprints() {
  return Object.fromEntries(inputs().map(file => [file, crypto.createHash('sha256').update(read(file)).digest('hex')]));
}
function buildGraph() {
  const hashes = fingerprints();
  const catalog = buildCatalog();
  const nodes = Object.keys(hashes).map(id => ({ id, kind: id.endsWith('.md') ? 'document' : id.startsWith('test/') ? 'test' : id.endsWith('.sql') ? 'schema' : 'source' }));
  const ids = new Set(nodes.map(node => node.id));
  const edges = [];
  const add = (from, to, relation) => { if (ids.has(to)) edges.push({ from, to, relation }); };
  for (const file of catalog.files) {
    const node = nodes.find(item => item.id === file.path);
    node.symbols = file.functions.map(fn => ({ name: fn.name, line: fn.line }));
    for (const dependency of file.dependencies.filter(value => value.startsWith('.'))) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), dependency.split('?')[0]));
      const resolved = [base, `${base}.js`, `${base}.mjs`, `${base}.json`, `${base}/index.js`].find(candidate => ids.has(candidate));
      if (resolved) add(file.path, resolved, 'imports');
    }
  }
  for (const node of nodes) {
    let dir = path.posix.dirname(node.id);
    while (dir !== '.') {
      if (`${dir}/README.md` !== node.id && ids.has(`${dir}/README.md`)) { add(node.id, `${dir}/README.md`, 'documented-by'); break; }
      dir = path.posix.dirname(dir);
    }
    if (node.kind === 'document') {
      const text = read(node.id);
      node.title = text.match(/^#\s+(.+)$/m)?.[1] || node.id;
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (target && !/^[a-z]+:/i.test(target)) add(node.id, path.posix.normalize(path.posix.join(path.posix.dirname(node.id), target)), 'references');
      }
    }
  }
  const runtime = 'frontend/client/src/workspace/runtime.js';
  catalog.runtime.forEach((part, index) => {
    add(runtime, part.path, 'assembles');
    if (index) add(catalog.runtime[index - 1].path, part.path, 'runtime-before');
  });
  return { schemaVersion: 1, scope: 'Static imports, documentation links, named symbols and runtime order; not a complete call graph. Tests are indexed, not claimed as coverage.', hashes, nodes, edges };
}
function main(args) {
  const command = args[0];
  if (command === 'build') {
    const graph = buildGraph();
    fs.writeFileSync(path.join(projectRoot, output), JSON.stringify(graph) + '\n');
    console.log(`Knowledge graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
    return;
  }
  if (!fs.existsSync(path.join(projectRoot, output))) throw new Error('Graph missing; run npm run knowledge:build.');
  const graph = JSON.parse(read(output));
  const fresh = JSON.stringify(graph.hashes) === JSON.stringify(fingerprints());
  if (!fresh) throw new Error('Knowledge graph stale; run npm run knowledge:build before using it.');
  if (command === 'check') { console.log('Knowledge graph is current.'); return; }
  if (command !== 'query' || !args.slice(1).join(' ').trim()) throw new Error('Usage: node scripts/knowledge-graph.cjs build|check|query <topic or symbol>');
  const terms = args.slice(1).join(' ').toLowerCase().split(/\s+/);
  const ranked = graph.nodes.map(node => {
    const text = `${node.id} ${node.title || ''} ${(node.symbols || []).map(s => s.name).join(' ')}`.toLowerCase();
    return { node, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) };
  }).filter(item => item.score === terms.length).sort((a, b) => a.node.id.localeCompare(b.node.id));
  console.log(`${ranked.length} matches; showing at most 12. Narrow the query when needed.`);
  for (const { node } of ranked.slice(0, 12)) {
    console.log(`\n${node.id}${node.title ? ` — ${node.title}` : ''}`);
    const symbols = (node.symbols || []).filter(symbol => terms.some(term => symbol.name.toLowerCase().includes(term))).slice(0, 6);
    symbols.forEach(symbol => console.log(`  symbol ${symbol.name}:${symbol.line}`));
    const related = graph.edges.filter(edge => edge.from === node.id || edge.to === node.id);
    related.slice(0, 8).forEach(edge => console.log(`  ${edge.from} --${edge.relation}--> ${edge.to}`));
    if (related.length > 8) console.log(`  ... ${related.length - 8} more edges in ${output}`);
  }
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildGraph, fingerprints };
