// Read-only documentation inventory: load route definitions without starting server.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'docs', 'technical-documentation');
fs.mkdirSync(destination, { recursive: true });
const index = fs.readFileSync(path.join(root, 'src/routes/index.js'), 'utf8');
const imports = Object.fromEntries([...index.matchAll(/const (\w+) = require\('\.\/(\w+)'\)/g)].map(m => [m[1], m[2]]));
const mounts = [...index.matchAll(/router\.use\('([^']+)',\s*(?:require\('\.\/(\w+)'\)|(\w+))\)/g)]
  .map(m => ({ prefix: '/api' + m[1], file: m[2] || imports[m[3]] }));
mounts.unshift({ prefix: '/api/auth', file: 'authRoutes' });
function declarations(source) {
  const entries = [];
  for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)) {
    let depth = 1, quote = '', escape = false, end = match.index + match[0].length;
    for (; end < source.length && depth; end++) {
      const c = source[end];
      if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; }
      else if (['"', "'", '`'].includes(c)) quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    entries.push({ method: match[1], code: source.slice(match.index, end), line: source.slice(0, match.index).split('\n').length });
  }
  return entries;
}
function permission(code, source, routePath) {
  if (/router\.use\(requireAdmin\)/.test(source) || /\b(requireAdmin|adminOnly)\b/.test(code)) return 'admin';
  const found = [...code.matchAll(/require(?:Permission|PageAccess)\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map(m => m[1] + ':' + m[2]);
  if (/transferPermissions/.test(code)) return 'asset-register + server-racks + asset-modelling: ' + (/\/export/.test(code) ? 'read' : 'read/create/update; TPRM/risk read jika ada referensi');
  if (/photoPermission/.test(code)) return 'assets: asset-register; racks: server-racks; read foto aset juga via server-racks';
  if (/requireFrameworkEvidenceAccess/.test(code)) return 'framework / iso27001 / iso27001-soa:update';
  const dynamic = code.match(/(?:frameworkPermission|targetPermission)\('([^']+)'/);
  if (dynamic) return 'key framework/assessment dinamis:' + dynamic[1];
  if (/requirePermission\(key/.test(code) || /requirePermission\(keys\[kind\]/.test(code)) {
    const kind = routePath.split('/')[1];
    const key = { assets: 'asset-register', racks: 'server-racks', placements: 'server-racks', relations: 'asset-modelling' }[kind];
    const action = code.match(/requirePermission\([^,]+,\s*'([^']+)'/)?.[1];
    return key + ':' + action;
  }
  if (found.length) return found.join(' + ');
  return 'session; pemeriksaan tambahan di handler/service (lihat source)';
}
const records = [];
for (const mount of mounts) {
  const file = 'src/routes/' + mount.file + '.js';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const defs = declarations(source);
  const router = require(path.join(root, file));
  for (const layer of router.stack.filter(layer => layer.route)) {
    const route = layer.route;
    for (const method of Object.keys(route.methods)) {
      const routePath = route.path;
      const candidates = defs.filter(d => d.method === method);
      const definition = candidates.find(d => new RegExp('^router\\.' + method + '\\s*\\(\\s*[\'"]' + routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"]\\s*,').test(d.code))
        || candidates.find(d => /['"]\/['"]\s*\+kind/.test(d.code) && (routePath.endsWith('/:id') === /\/:id/.test(d.code)));
      if (!definition) throw new Error('Missing source declaration for ' + method + ' ' + file + routePath);
      const handler = route.stack.at(-1).handle;
      const handlerSource = handler.toString();
      const combined = definition.code + '\n' + handlerSource;
      const fields = type => [...new Set([...combined.matchAll(new RegExp('req\\.' + type + '(?:\\?\\.)?\\.?([a-zA-Z_$][\\w$]*)', 'g'))].map(m => m[1]))];
      records.push({ method: method.toUpperCase(), path: mount.prefix + (routePath === '/' ? '' : routePath),
        module: mount.file, source: file, line: definition.line,
        permission: mount.file === 'authRoutes' && ['/login','/logout'].includes(routePath) ? 'public' : permission(definition.code, source, routePath),
        handler: handler.name || 'inline', bodyFieldsObserved: fields('body'), queryFieldsObserved: fields('query'),
        sourceDeclaration: definition.code, handlerSource });
    }
  }
}
for (const route of require('../src/routes').stack.filter(layer => layer.route)) {
  for (const method of Object.keys(route.route.methods)) records.push({ method: method.toUpperCase(), path: '/api' + route.route.path, module:'health',source:'src/routes/index.js',line:25,permission:'session',handler:route.route.stack.at(-1).handle.name||'inline',bodyFieldsObserved:[],queryFieldsObserved:[],sourceDeclaration: route.route.stack.at(-1).handle.toString(),handlerSource:route.route.stack.at(-1).handle.toString() });
}
const catalog = { generatedAt: new Date().toISOString(), basis: 'Local Express router definitions; no HTTP requests or database queries', endpointCount: records.length, endpoints: records };
fs.writeFileSync(path.join(destination, 'api-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ endpointCount: records.length, modules: mounts.length + 1, output: 'docs/technical-documentation/api-catalog.json' }));
require('../src/config/database').pool.end();
