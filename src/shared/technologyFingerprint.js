/** Passive technology hints; signatures cannot prove a complete application stack. */
const MAX_ASSETS = 12;
const signatures = [
  ['server', /(?:^|\s)nginx(?:\/([\w.-]+))?/i, 'nginx', 'platform'],
  ['server', /(?:^|\s)Apache(?:\/([\w.-]+))?/i, 'Apache HTTP Server', 'platform'],
  ['server', /Microsoft-IIS(?:\/([\w.-]+))?/i, 'Microsoft IIS', 'platform'],
  ['server', /(?:^|\s)Caddy(?:\/([\w.-]+))?/i, 'Caddy', 'platform'],
  ['server', /LiteSpeed(?:\/([\w.-]+))?/i, 'LiteSpeed', 'platform'],
  ['server', /openresty(?:\/([\w.-]+))?/i, 'OpenResty', 'platform'],
  ['x-powered-by', /PHP(?:\/([\w.-]+))?/i, 'PHP', 'framework'],
  ['x-powered-by', /Express\b/i, 'Express', 'framework'],
  ['x-powered-by', /Next\.js(?:\s*([\d][\w.-]*))?/i, 'Next.js', 'framework'],
  ['x-powered-by', /ASP\.NET\b/i, 'ASP.NET', 'framework'],
  ['x-aspnet-version', /^([\w.-]+)/, 'ASP.NET', 'framework'],
  ['x-aspnetmvc-version', /^([\w.-]+)/, 'ASP.NET MVC', 'framework'],
  ['server', /cloudflare/i, 'Cloudflare', 'platform'],
  ['cf-ray', /.+/, 'Cloudflare', 'platform'],
  ['x-vercel-id', /.+/, 'Vercel', 'platform'],
  ['x-amz-cf-id', /.+/, 'Amazon CloudFront', 'platform'],
  ['x-nf-request-id', /.+/, 'Netlify', 'platform'],
];
const headerNames = [...new Set(signatures.map((row) => row[0]))];
function detect(headers) {
  const found = new Map();
  for (const [header, pattern, name, quadrant] of signatures) {
    const raw = headers[header];
    const value = typeof raw === 'string' ? raw.slice(0, 256) : '';
    const match = value.match(pattern);
    if (!match) continue;
    const previous = found.get(name);
    found.set(name, {
      name,
      version: match[1] || previous?.version || '',
      quadrant,
      ring: 'assess',
      source: 'header',
      evidence: `${header}: ${value}`,
      notes: '',
    });
  }
  return [...found.values()];
}
function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
    values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return values;
}
function safeAssetUrl(value) {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'), 'https://fixture.invalid');
    const version =
      ['ver', 'version', 'v']
        .map((name) => url.searchParams.get(name))
        .find((v) => /^\d[\w.+-]{0,60}$/.test(v || '')) || '';
    return { path: url.pathname.slice(0, 1000), host: url.hostname, version };
  } catch {
    return { path: '', host: '', version: '' };
  }
}
/** Original local signatures inspired by passive web profiling; no external dataset or JS execution. */
function detectPage(headers, html = '', setCookie = [], assets = []) {
  const found = new Map();
  function add(name, version, quadrant, evidence, source = 'scan') {
    version = String(version).slice(0, 100);
    const related = [...found.values()].filter((row) => row.name === name);
    if (!version && related.some((row) => row.version)) return;
    if (version) found.delete(name + '|');
    const key = name + '|' + version,
      previous = found.get(key);
    const combined =
      previous && !previous.evidence.includes(evidence) ? previous.evidence + '; ' + evidence : evidence;
    found.set(key, {
      name,
      version,
      quadrant,
      ring: 'assess',
      source: previous?.source === 'scan' ? 'scan' : source,
      evidence: combined.slice(0, 1000),
      notes: '',
    });
  }
  for (const row of detect(headers)) add(row.name, row.version, row.quadrant, row.evidence, 'header');
  const source = String(html).slice(0, 512 * 1024);
  for (const match of source.matchAll(/<(meta|script|link)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase(),
      attrs = attributes(match[0]);
    if (
      tag === 'script' &&
      (!attrs.type || /^(?:module|(?:text|application)\/(?:java|ecma)script)$/i.test(attrs.type))
    )
      add('JavaScript', '', 'framework', 'HTML script tag');
    if (tag === 'meta' && (attrs.name || '').toLowerCase() === 'generator') {
      const value = (attrs.content || '').slice(0, 256);
      for (const [name, pattern, quadrant] of [
        ['WordPress', /WordPress(?:\s+([\d][\w.+-]*))?/i, 'platform'],
        ['Drupal', /Drupal(?:\s+([\d][\w.+-]*))?/i, 'platform'],
        ['Joomla', /Joomla!?(?:\s+([\d][\w.+-]*))?/i, 'platform'],
        ['WooCommerce', /WooCommerce(?:\s+([\d][\w.+-]*))?/i, 'platform'],
        ['Next.js', /Next\.js(?:\s+([\d][\w.+-]*))?/i, 'framework'],
        ['Nuxt', /Nuxt(?:\s+([\d][\w.+-]*))?/i, 'framework'],
      ]) {
        const signature = value.match(pattern);
        if (signature)
          add(
            name,
            signature[1] || '',
            quadrant,
            'generator: ' + name + (signature[1] ? ' ' + signature[1] : ''),
          );
      }
    }
    const raw = tag === 'script' ? attrs.src : tag === 'link' ? attrs.href : '';
    if (!raw) continue;
    const asset = safeAssetUrl(raw),
      path = asset.path;
    for (const [name, marker, versionPattern, quadrant] of [
      ['jQuery', /(?:^|\/)jquery(?:[./@-])/i, /jquery(?:@|[-/])(?:v)?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      [
        'React',
        /(?:^|\/)react(?:-dom)?(?:[./@-])/i,
        /react(?:-dom)?(?:@|[-/])(?:v)?(\d+\.\d+(?:\.\d+)?)/i,
        'framework',
      ],
      ['Vue.js', /(?:^|\/)vue(?:[./@-])/i, /vue(?:@|[-/])(?:v)?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      [
        'Bootstrap',
        /(?:^|\/)bootstrap(?:[./@-])/i,
        /bootstrap(?:@|[-/])(?:v)?(\d+\.\d+(?:\.\d+)?)/i,
        'framework',
      ],
      [
        'Tailwind CSS',
        /(?:^|\/)tailwindcss(?:[./@-])/i,
        /tailwindcss(?:@|[-/])(?:v)?(\d+\.\d+(?:\.\d+)?)/i,
        'framework',
      ],
    ])
      if (marker.test(path)) {
        const version = path.match(versionPattern)?.[1] || asset.version;
        add(
          name,
          version,
          quadrant,
          tag + ': ' + path.slice(0, 180) + (version ? ' (version ' + version + ')' : ''),
        );
      }
    for (const [name, file, quadrant] of [
      ['Lodash', 'lodash', 'framework'],
      ['Axios', 'axios', 'framework'],
      ['Moment.js', 'moment', 'framework'],
      ['Day.js', 'dayjs', 'framework'],
      ['Alpine.js', 'alpinejs', 'framework'],
      ['htmx', 'htmx', 'framework'],
      ['Chart.js', 'chart.js', 'tool'],
      ['D3.js', 'd3', 'tool'],
      ['Select2', 'select2', 'framework'],
      ['DataTables', 'datatables', 'framework'],
      ['SweetAlert2', 'sweetalert2', 'framework'],
      ['Socket.IO', 'socket.io', 'framework'],
      ['Svelte', 'svelte', 'framework'],
    ]) {
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const marker = new RegExp('(?:^|/)' + escaped + '(?=[./@-]|$)', 'i');
      const versionPattern = new RegExp(escaped + '(?:@|[-/])v?(\\d+\\.\\d+(?:\\.\\d+)?)', 'i');
      if (marker.test(path))
        add(name, path.match(versionPattern)?.[1] || asset.version, quadrant, tag + ' marker: ' + file);
    }
    if (path.includes('/_next/static/')) add('Next.js', '', 'framework', tag + ' marker: /_next/static/');
    if (path.includes('/_nuxt/')) add('Nuxt', '', 'framework', tag + ' marker: /_nuxt/');
    if (/\/wp-(?:content|includes)\//i.test(path))
      add('WordPress', '', 'platform', tag + ' marker: /wp-content/ or /wp-includes/');
    if (/\/core\/misc\/drupal(?:\.min)?\.js/i.test(path))
      add('Drupal', '', 'platform', tag + ' marker: /core/misc/drupal.js');
    if (/\/woocommerce\//i.test(path)) add('WooCommerce', '', 'platform', tag + ' marker: /woocommerce/');
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(asset.host))
      add('Google Font API', '', 'tool', tag + ' host: ' + asset.host);
    if (['maps.googleapis.com', 'maps.google.com', 'maps.gstatic.com'].includes(asset.host))
      add('Google Maps', '', 'tool', tag + ' host: ' + asset.host);
    if (/(?:^|\/)zone(?:[./@-])/i.test(path))
      add(
        'Zone.js',
        path.match(/zone(?:\.js)?(?:@|[-/])(\d+\.\d+(?:\.\d+)?)/i)?.[1] || '',
        'framework',
        tag + ' marker: zone',
      );
    if (/(?:^|\/)ckeditor(?:[./@-])/i.test(path)) add('CKEditor', '', 'tool', tag + ' marker: ckeditor');
    if (asset.host === 'cdn.tailwindcss.com')
      add('Tailwind CSS', '', 'framework', 'script host: cdn.tailwindcss.com');
    if (asset.host === 'cdn.shopify.com') add('Shopify', '', 'platform', tag + ' host: cdn.shopify.com');
    if (asset.host === 'www.googletagmanager.com')
      add(
        /\/gtm\.js/.test(path) ? 'Google Tag Manager' : 'Google Analytics',
        '',
        'tool',
        'script host: www.googletagmanager.com',
      );
  }
  if (/<meta\b[^>]*\bproperty\s*=\s*["']og:/i.test(source))
    add('Open Graph', '', 'tool', 'HTML meta property: og:*');
  if (/<link\b[^>]*\brel\s*=\s*["']manifest["']/i.test(source))
    add('Web App Manifest', '', 'platform', 'HTML link: manifest (not proof of offline PWA support)');
  if (/(?:https?:)?\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(source))
    add('WhatsApp Chat', '', 'tool', 'HTML WhatsApp link (not proof of Business API use)');
  const angular = source.match(/\bng-version\s*=\s*["']([\d][\w.+-]*)["']/i);
  if (angular) add('Angular', angular[1], 'framework', 'HTML attribute: ng-version=' + angular[1]);
  if (/\bdata-reactroot\b|\b_reactRootContainer\b/.test(source))
    add('React', '', 'framework', 'HTML marker: data-reactroot / _reactRootContainer');
  if (/\bdata-v-app\b|\bdata-v-[0-9a-f]{6,}\b/i.test(source))
    add('Vue.js', '', 'framework', 'HTML marker: data-v-app / data-v-*');
  if (/\bname\s*=\s*["']csrfmiddlewaretoken["']/i.test(source))
    add('Django', '', 'framework', 'HTML field: csrfmiddlewaretoken');
  if (/\b__NEXT_DATA__\b/.test(source)) add('Next.js', '', 'framework', 'HTML marker: __NEXT_DATA__');
  if (/\b__NUXT__\b/.test(source)) add('Nuxt', '', 'framework', 'HTML marker: __NUXT__');
  // Read version banners in a few same-origin static assets; never evaluate their code.
  for (const asset of assets.slice(0, MAX_ASSETS))
    for (const [name, pattern, quadrant] of [
      ['jQuery', /jQuery(?: JavaScript Library)?\s+v?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      ['Bootstrap', /Bootstrap\s+v?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      [
        'Vue.js',
        /(?:Vue(?:\.js)?|@vue\/(?:shared|runtime-core|runtime-dom))\s+v?(\d+\.\d+(?:\.\d+)?)/i,
        'framework',
      ],
      ['React', /React\s+v?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      ['Angular', /(?:Angular|@angular\/core)\s+v?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
      ['Lodash', /lodash(?:\.js)?\s+v?(\d+\.\d+(?:\.\d+)?)/i, 'framework'],
    ]) {
      const match = String(asset.text || '')
        .slice(0, 128 * 1024)
        .match(pattern);
      if (match) add(name, match[1], quadrant, 'asset version banner: ' + name + ' ' + match[1]);
    }
  // Cookie names only. Values, tokens and the full source document are never returned.
  const cookies = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  for (const raw of cookies) {
    const name = String(raw).split('=', 1)[0].trim();
    if (name === 'PHPSESSID') add('PHP', '', 'framework', 'cookie name: PHPSESSID');
    if (name === 'JSESSIONID') add('Java Servlet', '', 'framework', 'cookie name: JSESSIONID');
    if (name.toLowerCase() === 'asp.net_sessionid')
      add('ASP.NET', '', 'framework', 'cookie name: ASP.NET_SessionId');
    if (name === 'laravel_session') add('Laravel', '', 'framework', 'cookie name: laravel_session');
    if (name === '_rails_session') add('Ruby on Rails', '', 'framework', 'cookie name: _rails_session');
  }
  return [...found.values()].slice(0, 100);
}
function assetUrls(html, base) {
  const origin = new URL(base).origin,
    urls = new Set();
  for (const match of String(html)
    .slice(0, 512 * 1024)
    .matchAll(/<(script|link)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const raw =
      match[1].toLowerCase() === 'script'
        ? attrs.src
        : (attrs.rel || '').toLowerCase() === 'stylesheet'
          ? attrs.href
          : '';
    if (!raw) continue;
    try {
      const url = new URL(raw.replaceAll('&amp;', '&'), base);
      url.hash = '';
      if (url.origin === origin && /\.(?:m?js|css)$/i.test(url.pathname) && !url.username && !url.password)
        urls.add(url.href);
    } catch {}
    if (urls.size === MAX_ASSETS) break;
  }
  return [...urls];
}
module.exports = { detect, detectPage, assetUrls, headerNames, MAX_ASSETS };
