/** Resolve lexical references across the assembled classic program without executing application code. */
const fs = require('node:fs');
const { parse } = require('@babel/parser');
const { readRuntimeManifest } = require('./runtime-manifest.cjs');
const contractPath = 'frontend/client/src/workspace/runtime-contracts.json';
function analyze(plan, sources) {
  let offset = 0;
  const ranges = plan.map((row, i) => { const start = offset; offset += sources[i].length; return { ...row, start, end: offset }; });
  const ast = parse(sources.join(''), { sourceType: 'script' });
  const root = { parent: null, bindings: new Map(), function: true };
  const scopes = new WeakMap(), declarations = new WeakSet();
  const owner = node => ranges.find(row => node.start >= row.start && node.start < row.end)?.name;
  function bind(pattern, scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') { scope.bindings.set(pattern.name, { owner: owner(pattern), node: pattern }); declarations.add(pattern); }
    else if (pattern.type === 'RestElement') bind(pattern.argument, scope);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left, scope);
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(p => bind(p.value || p.argument, scope));
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(p => bind(p, scope));
  }
  function children(node, visit) {
    for (const [key, value] of Object.entries(node)) {
      if (['loc','extra','comments','tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) visit(child, key); });
      else if (value?.type) visit(value, key);
    }
  }
  function collect(node, scope) {
    if (/Function/.test(node.type) || /Method$/.test(node.type)) {
      if (node.type === 'FunctionDeclaration') bind(node.id, scope);
      scope = { parent: scope, bindings: new Map(), function: true };
      bind(node.id, scope); (node.params || []).forEach(p => bind(p, scope));
    } else if (['BlockStatement','CatchClause','ForStatement','ForOfStatement','ForInStatement','ClassExpression','ClassDeclaration'].includes(node.type)) {
      if (node.type === 'ClassDeclaration') bind(node.id, scope);
      scope = { parent: scope, bindings: new Map() };
      if (node.type === 'CatchClause') bind(node.param, scope);
      if (node.type.startsWith('Class')) bind(node.id, scope);
    }
    scopes.set(node, scope);
    if (node.type === 'VariableDeclaration') {
      let target = scope;
      if (node.kind === 'var') while (target.parent && !target.function) target = target.parent;
      node.declarations.forEach(d => bind(d.id, target));
    }
    children(node, child => collect(child, scope));
  }
  collect(ast.program, root);
  const rows = Object.fromEntries(plan.map(row => [row.name, { name: row.name, imports: {}, globals: [], exports: [] }]));
  for (const [name, binding] of root.bindings) if (binding.owner) rows[binding.owner].exports.push(name);
  function refs(node, parent, key) {
    if (node.type === 'Identifier' && !declarations.has(node)) {
      const property = ['MemberExpression','OptionalMemberExpression'].includes(parent?.type) && key === 'property' && !parent.computed;
      const objectKey = ['ObjectProperty','ObjectMethod','ClassMethod','ClassProperty'].includes(parent?.type) && key === 'key' && !parent.computed;
      if (!property && !objectKey && !['label','break','continue'].includes(key)) {
        let scope = scopes.get(node), binding;
        while (scope && !binding) { binding = scope.bindings.get(node.name); if (!binding) scope = scope.parent; }
        const consumer = rows[owner(node)];
        if (consumer && binding && scope === root && binding.owner !== consumer.name) consumer.imports[node.name] = binding.owner;
        if (consumer && !binding) consumer.globals.push(node.name);
      }
    }
    children(node, (child, childKey) => refs(child, node, childKey));
  }
  refs(ast.program);
  return Object.values(rows).map(row => ({ ...row, imports: Object.fromEntries(Object.entries(row.imports).sort()), globals: [...new Set(row.globals)].sort(), exports: row.exports.sort() }));
}
function current() { const plan = readRuntimeManifest(); return analyze(plan, plan.map(row => fs.readFileSync(row.path, 'utf8'))); }
function checkContracts() {
  const expected = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const actual = current();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Workspace dependency contract changed. Review imports/exports/globals, then run npm run runtime:contracts.');
  return actual;
}
if (require.main === module) {
  if (process.argv.includes('--write')) fs.writeFileSync(contractPath, JSON.stringify(current(), null, 2) + '\n');
  else { checkContracts(); console.log('Workspace lexical dependency contracts passed.'); }
}
module.exports = { analyze, checkContracts };
