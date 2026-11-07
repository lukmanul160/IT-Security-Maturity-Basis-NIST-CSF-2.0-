/**
 * Inventaris statis kode aplikasi. Hanya membaca root sumber yang diizinkan;
 * tidak require modul aplikasi, memuat .env, atau membuka koneksi database.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const { validateRuntimeManifest, readRuntimeManifest } = require('./runtime-manifest.cjs');

const projectRoot = path.resolve(__dirname, '../..');
const roots = ['src', 'frontend/client/src'];
const staticScripts = ['frontend/public/branding.js', 'frontend/public/i18n.js', 'frontend/public/theme.js'];
const staticFolders = ['frontend/public/statements/assets', 'frontend/public/virtual-office/assets'];
const vendorFiles = new Set(['three.module.js', 'three.core.js', 'OrbitControls.js']);
const slash = value => value.split(path.sep).join('/');

/** Walk hanya folder sumber; output prepare/build bukan sumber yang dipelihara. */
function sourceFiles(root = projectRoot) {
  const files = [];
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (entry.name === 'generated' || vendorFiles.has(entry.name)) continue;
      const name = slash(path.join(relative, entry.name));
      if (entry.isDirectory()) walk(name);
      else if (/\.(?:js|mjs|vue)$/.test(entry.name)) files.push(name);
    }
  }
  roots.forEach(walk);
  staticFolders.filter(folder => fs.existsSync(path.join(root, folder))).forEach(walk);
  return [...files, ...staticScripts.filter(file => fs.existsSync(path.join(root, file)))].sort();
}

/** Vue SFC tetap dicatat sebagai satu file; offset baris merujuk file sumber. */
function scriptBlocks(source, filename) {
  if (!filename.endsWith('.vue')) return [{ source, offset: 0 }];
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => ({
    source: match[1],
    offset: source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1,
  }));
}

/** AST dipakai agar fungsi di komentar/string tidak salah dianggap deklarasi. */
function analyzeSource(source, filename) {
  const functions = [], dependencies = new Set();
  for (const block of scriptBlocks(source, filename)) {
    const ast = parse(block.source, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
    const signature = node => block.source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 180);
    function visit(node, parent) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source) dependencies.add(node.source.value);
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0]?.type === 'StringLiteral') dependencies.add(node.arguments[0].value);
      const named = node.type === 'FunctionDeclaration' ? node.id?.name
        : ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.type) && parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name
          : null;
      if (named) {
        const comments = node.leadingComments || parent?.leadingComments || [];
        const description = (comments.at(-1)?.value || '')
          .replace(/\r\n?/g, '\n')
          .replace(/^[ \t]*\* ?/gm, '')
          .trim().split('\n')[0].trim();
        functions.push({ name: named, line: node.loc.start.line + block.offset, async: !!node.async, parameters: node.params.map(signature), description });
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => visit(child, node));
        else if (value && typeof value === 'object') visit(value, node);
      }
    }
    visit(ast, null);
  }
  return { functions, dependencies: [...dependencies].sort() };
}

/** Baca runtime tanpa mengeksekusinya; urutan array adalah kontrak shared scope. */
function runtimeParts(source, manifest) {
  if (manifest) {
    if (!source.includes("import sourceOrder from './runtime-parts.json'")) throw new Error('Runtime does not import its source manifest.');
    return validateRuntimeManifest(manifest);
  }
  const imports = new Map([...source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\?raw)['"]/g)].map(match => [match[1], match[2].replace(/\?raw$/, '')]));
  const body = source.match(/export default\s*\[([\s\S]*?)\]\.join\(''\)/)?.[1];
  if (!body) throw new Error('Runtime assembly contract changed; review runtimeParts().');
  return body.split(',').map(value => value.trim()).filter(Boolean).map(name => {
    if (!imports.has(name)) throw new Error(`Runtime entry has no raw import: ${name}`);
    return { name, path: path.posix.normalize(path.posix.join('frontend/client/src/workspace', imports.get(name))) };
  });
}

function buildCatalog(root = projectRoot) {
  const runtimeSource = fs.readFileSync(path.join(root, 'frontend/client/src/workspace/runtime.js'), 'utf8');
  const manifestFile = path.join(root, 'frontend/client/src/workspace/runtime-parts.json');
  return {
    schemaVersion: 1,
    scope: 'Application JS/MJS/Vue sources only; no generated assets, credentials or business data.',
    runtime: runtimeParts(runtimeSource, fs.existsSync(manifestFile) ? readRuntimeManifest(root) : undefined),
    files: sourceFiles(root).map(file => ({ path: file, ...analyzeSource(fs.readFileSync(path.join(root, file), 'utf8'), file) })),
  };
}

/** Markdown singkat menunjuk JSON lengkap; fungsi dapat dicari lewat nama/path. */
function catalogMarkdown(catalog) {
  const groups = new Map();
  for (const file of catalog.files) {
    const group = path.posix.dirname(file.path);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(file);
  }
  const lines = ['# Katalog sumber aplikasi', '', 'Dibuat oleh `npm run docs:source`. Jangan edit tabel manual.', '',
    '`source-catalog.json` memuat nama fungsi, baris, parameter, komentar dan dependency statis.',
    'Indeks ini bukan call graph lengkap atau bukti bahwa semua fungsi telah memiliki dokumentasi bisnis.', '',
    `Cakupan: ${catalog.files.length} file, ${catalog.files.reduce((n, file) => n + file.functions.length, 0)} fungsi bernama, ${catalog.runtime.length} fragmen runtime.`, '',
    '## Urutan runtime', '', ...catalog.runtime.map((part, i) => `${i + 1}. \`${part.path}\` (${part.name})`), ''];
  for (const [group, files] of groups) {
    lines.push(`## ${group}`, '', '| File | Fungsi bernama |', '| --- | --- |');
    for (const file of files) lines.push(`| [${path.posix.basename(file.path)}](../${file.path}) | ${file.functions.map(fn => `\`${fn.name}\``).join(', ') || 'Markup / konfigurasi / binding'} |`);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { projectRoot, sourceFiles, analyzeSource, runtimeParts, buildCatalog, catalogMarkdown };
