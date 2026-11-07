/** Regenerasi/check katalog tanpa memuat aplikasi maupun konfigurasi instalasi. */
const fs = require('node:fs');
const path = require('node:path');
const { projectRoot, buildCatalog, catalogMarkdown } = require('./lib/source-catalog.cjs');
/** Reuse a parsed catalog in the structure gate instead of scanning every source twice. */
function documentSource(catalog, check = false) {
  const outputs = {
    'docs/source-catalog.json': JSON.stringify(catalog, null, 2) + '\n',
    'docs/SOURCE_CATALOG.md': catalogMarkdown(catalog),
  };
  let stale = false;
  for (const [file, value] of Object.entries(outputs)) {
    const target = path.join(projectRoot, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== value.replace(/\r\n/g, '\n')) {
        console.error(`${file} is stale; run npm run docs:source.`);
        stale = true;
      }
    } else fs.writeFileSync(target, value);
  }
  return !stale;
}

if (require.main === module) {
  const catalog = buildCatalog();
  process.exitCode = documentSource(catalog, process.argv.includes('--check')) ? 0 : 1;
  if (!process.exitCode) console.log(`Source catalog: ${catalog.files.length} files parsed; ${catalog.runtime.length} runtime fragments.`);
}
module.exports = { documentSource };
