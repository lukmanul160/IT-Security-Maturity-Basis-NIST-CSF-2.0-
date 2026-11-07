/** Static architecture/UI contracts; application modules are never executed. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse: parseVue } = require('vue/compiler-sfc');
const { projectRoot, buildCatalog } = require('./lib/source-catalog.cjs');

/** Parse Vue nodes rather than regex, so quoted > and v-pre are handled correctly. */
function implicitButtons(source, filename) {
  const parsed = parseVue(source, { filename });
  if (parsed.errors.length) throw new Error(`${filename}: ${parsed.errors.join('; ')}`);
  const result = [];
  function walk(node, form) {
    if (node.type === 1) {
      if (node.tag === 'form') form = node;
      const typed = node.props.some(prop => prop.name === 'type' || prop.name === 'bind' && prop.arg?.content === 'type');
      if (node.tag === 'button' && !typed) {
        const click = node.props.some(prop => prop.name.startsWith('@click') || prop.name === 'onclick' || prop.name === 'on' && prop.arg?.content === 'click');
        result.push({ offset: node.loc.start.offset, line: node.loc.start.line, intendedType: form && !click ? 'submit' : 'button' });
      }
    }
    for (const child of node.children || []) walk(child, form);
  }
  if (parsed.descriptor.template?.ast) walk(parsed.descriptor.template.ast, null);
  return result;
}

function checkStructure() {
  const catalog = buildCatalog();
  const errors = [], seen = new Set();
  for (const part of catalog.runtime) {
    if (seen.has(part.path)) errors.push(`Duplicate runtime source: ${part.path}`);
    seen.add(part.path);
    if (/^part\d+$/.test(part.name)) errors.push(`Runtime import needs a meaningful name: ${part.name}`);
    if (!fs.existsSync(path.join(projectRoot, part.path))) errors.push(`Missing runtime source: ${part.path}`);
  }
  // Compile the assembled shared scope to detect lexical collisions/order breakage.
  new vm.Script(catalog.runtime.map(part => fs.readFileSync(path.join(projectRoot, part.path), 'utf8')).join(''), { filename: 'workspace-assembled.js' });
  for (const file of catalog.files) {
    if (file.path.includes('/workspace/features/') && file.path.endsWith('.js') && !seen.has(file.path)) errors.push(`Feature source is missing from runtime: ${file.path}`);
    if (!file.path.endsWith('.vue')) continue;
    for (const issue of implicitButtons(fs.readFileSync(path.join(projectRoot, file.path), 'utf8'), file.path)) errors.push(`${file.path}:${issue.line}: button needs explicit type (${issue.intendedType}).`);
  }
  const features = path.join(projectRoot, 'frontend/client/src/workspace/features');
  for (const directory of fs.readdirSync(features, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    if (!fs.existsSync(path.join(features, directory.name, 'README.md'))) errors.push(`Missing feature guide: ${directory.name}/README.md`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog;
}

if (require.main === module) {
  try {
    const catalog = checkStructure();
    if (process.argv.includes('--catalog') && !require('./document-source.cjs').documentSource(catalog, true)) process.exitCode = 1;
    else console.log(`Structure/UI contracts passed: ${catalog.files.length} source files, ${catalog.runtime.length} runtime fragments.`);
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { implicitButtons, checkStructure };
