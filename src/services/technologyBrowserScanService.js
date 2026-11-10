/** Isolated rendered profiling. Chrome has no direct network; all allowed GETs use the pinned scanner transport. */
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const scanner = require('./technologyHeaderScanService');
const profile = require('../shared/technologyFingerprint');
const signatures = require('./technologySignatureService');
const probe = require('./technologyBrowserProbe');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url, {
      maxPayload: 2 * 1024 * 1024,
      handshakeTimeout: 3000,
      perMessageDeflate: false,
    });
    this.closed = false;
    this.pending = new Map();
    this.id = 0;
    this.onEvent = () => {};
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.on('error', () => this.close());
    this.socket.on('close', () => this.close());
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (entry) {
          this.pending.delete(message.id);
          clearTimeout(entry.timer);
          message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result);
        }
      } else this.onEvent(message);
    });
  }
  send(method, params = {}) {
    if (this.closed)
      return Promise.reject(Object.assign(Error('Browser channel closed'), { code: 'CDP_TIMEOUT' }));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(
            Object.assign(new Error('Browser command timeout'), { code: 'CDP_TIMEOUT', command: method }),
          );
        },
        method === 'Page.navigate' ? 10000 : 5000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Object.assign(Error('Browser closed'), { code: 'CDP_TIMEOUT' }));
    }
    this.pending.clear();
    this.socket.terminate();
  }
}
async function executable() {
  for (const candidate of [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]) {
    if (candidate)
      try {
        await fs.access(candidate);
        return candidate;
      } catch {}
  }
  throw new scanner.ScanError(
    'Mode browser memerlukan Chrome/Chromium pada server. Atur CHROME_PATH atau gunakan scan standar.',
    503,
  );
}
/** Small explicit runtime allowlist, never enumerate or return arbitrary window values. */
const runtimeExpression = `(()=>({html:document.documentElement.outerHTML.slice(0,524288),url:location.href,signals:{
  angular:document.querySelector('[ng-version]')?.getAttribute('ng-version')||'',zone:Boolean(window.Zone),
  jquery:window.jQuery?.fn?.jquery||'',vue:window.Vue?.version||'',react:window.React?.version||'',
  bootstrap:window.bootstrap?.Tooltip?.VERSION||window.jQuery?.fn?.tooltip?.Constructor?.VERSION||'',
  litHtml:Array.isArray(window.litHtmlVersions)?window.litHtmlVersions.slice(0,5):[],
  litElement:Array.isArray(window.litElementVersions)?window.litElementVersions.slice(0,5):[],
  ckeditor:window.CKEDITOR?.version||'',maps:Boolean(window.google?.maps),
  gtm:Boolean(window.google_tag_manager),lodash:window._?.VERSION||''
}}))()`;
function runtimeTechnologies(signals = {}) {
  const results = [];
  for (const [key, name, quadrant] of [
    ['angular', 'Angular', 'framework'],
    ['zone', 'Zone.js', 'framework'],
    ['jquery', 'jQuery', 'framework'],
    ['vue', 'Vue.js', 'framework'],
    ['react', 'React', 'framework'],
    ['bootstrap', 'Bootstrap', 'framework'],
    ['litHtml', 'lit-html', 'framework'],
    ['litElement', 'lit-element', 'framework'],
    ['ckeditor', 'CKEditor', 'tool'],
    ['maps', 'Google Maps', 'tool'],
    ['gtm', 'Google Tag Manager', 'tool'],
    ['lodash', 'Lodash', 'framework'],
  ]) {
    const values = Array.isArray(signals[key]) ? signals[key] : [signals[key]];
    for (const value of values) {
      if (!value) continue;
      const version = typeof value === 'string' && /^\d[\w.+-]{0,99}$/.test(value) ? value : '';
      results.push({
        name,
        version,
        quadrant,
        ring: 'assess',
        source: 'scan',
        evidence: 'Browser runtime: ' + name + (version ? ' ' + version : ''),
        notes: '',
      });
    }
  }
  return results;
}
function mergeTechnologies(...groups) {
  const found = new Map();
  for (const row of groups.flat()) {
    const key = row.name.toLowerCase() + '|' + row.version;
    if (!row.version && [...found.values()].some((item) => item.name === row.name && item.version)) {
      for (const [knownKey, known] of found)
        if (known.name === row.name && known.version)
          found.set(knownKey, {
            ...known,
            detection: known.detection || row.detection,
            evidence: [known.evidence, row.evidence].filter(Boolean).join('; ').slice(0, 1000),
          });
      continue;
    }
    if (row.version) found.delete(row.name.toLowerCase() + '|');
    const previous = found.get(key);
    found.set(
      key,
      previous
        ? {
            ...previous,
            ...row,
            evidence: [previous.evidence, row.evidence]
              .filter(Boolean)
              .filter((value, index, values) => values.indexOf(value) === index)
              .join('; ')
              .slice(0, 1000),
            detection: row.detection || previous.detection,
          }
        : row,
    );
  }
  return [...found.values()].slice(0, 100);
}
async function scan(url, dependencies = {}) {
  const progress = (percent, stage) => dependencies.onProgress?.({ percent, stage });
  progress(5, 'validating');
  const initial = await scanner.target(url, dependencies.resolve),
    binary = await executable();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-tech-render-'));
  let chrome,
    cdp,
    launchError,
    stopping = false,
    pageError,
    documentCount = 0,
    requests = 0,
    bytes = 0,
    blocked = 0,
    partial = false,
    main,
    loadedAt = 0,
    timeoutStage = '';
  async function observation(expression, fallback, stage, timeout) {
    try {
      const output = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, timeout });
      if (output.exceptionDetails) {
        partial = true;
        timeoutStage = stage;
        return fallback;
      }
      return output.result?.value || fallback;
    } catch (error) {
      if (cdp.closed) throw error;
      if (error.code === 'CDP_TIMEOUT' || /timed out|timeout|Execution was terminated/i.test(error.message)) {
        partial = true;
        timeoutStage = stage;
        return fallback;
      }
      throw error;
    }
  }
  const pending = new Set(),
    assets = [],
    observedRequests = [],
    documents = new Set([initial.url.href]);
  const deadline = Date.now() + 25000;
  try {
    progress(10, 'starting');
    chrome = spawn(
      binary,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-quic',
        '--disable-features=ServiceWorker',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--proxy-server=http://127.0.0.1:9',
        '--proxy-bypass-list=<-loopback>',
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=0',
        `--user-data-dir=${directory}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    chrome.once('error', (error) => {
      launchError = error;
    });
    let port;
    for (let i = 0; i < 70; i++) {
      if (launchError || chrome.exitCode !== null) break;
      try {
        port = (await fs.readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        break;
      } catch {
        await delay(100);
      }
    }
    if (!port)
      throw new scanner.ScanError(
        'Browser scanner gagal dijalankan. Periksa instalasi Chrome/Chromium dan sandbox server.',
        503,
      );
    const tab = await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: 'PUT',
        signal: AbortSignal.timeout(3000),
      })
    ).json();
    cdp = new Cdp(tab.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    const frame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    async function paused(event) {
      if (observedRequests.length < 100) {
        try {
          const parsed = new URL(event.request.url);
          observedRequests.push(parsed.origin + parsed.pathname);
        } catch {}
      }
      const reject = async () => {
        blocked++;
        await cdp
          .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
          .catch(() => {});
      };
      if (
        stopping ||
        Date.now() > deadline ||
        ++requests > 40 ||
        bytes >= 8 * 1024 * 1024 ||
        event.request.method !== 'GET' ||
        !['Document', 'Script', 'Stylesheet'].includes(event.resourceType) ||
        (event.resourceType === 'Document' && (event.frameId !== frame || ++documentCount > 4))
      ) {
        partial = true;
        return reject();
      }
      try {
        if (event.resourceType === 'Document' && !documents.has(new URL(event.request.url).href))
          throw new scanner.ScanError('Navigasi browser di luar URL dan redirect yang disetujui diblokir.');
        const destination = await scanner.target(event.request.url, dependencies.resolve);
        if (initial.scope === 'public' && destination.scope === 'internal')
          throw new scanner.ScanError(
            'Redirect publik ke jaringan internal diblokir. Scan URL internal secara langsung.',
          );
        if (
          event.resourceType !== 'Document' &&
          destination.scope === 'internal' &&
          destination.url.origin !== (main?.url || initial.url).origin
        )
          throw Error('Cross-origin internal resource');
        const response = await (
          dependencies.request ||
          ((target, asset) => scanner.requestPage(target, 'GET', { asset, browserAsset: asset }))
        )(destination, event.resourceType !== 'Document');
        progress(25 + Math.min(35, assets.length * 2), 'resources');
        bytes += response.htmlBytes || Buffer.byteLength(response.html || '');
        if (bytes > 8 * 1024 * 1024 || stopping) {
          partial = true;
          return reject();
        }
        if (response.truncated) {
          partial = true;
          if (event.resourceType !== 'Document') return reject();
        }
        if (event.resourceType === 'Document')
          main = { ...response, url: destination.url, scope: destination.scope };
        else assets.push({ text: response.html || '', kind: event.resourceType, url: destination.url.href });
        const headers = [
          { name: 'Content-Type', value: String(response.headers['content-type'] || 'text/plain') },
        ];
        if (response.headers.location) {
          const redirect = new URL(response.headers.location, destination.url);
          redirect.hash = '';
          if (event.resourceType === 'Document' && [301, 302, 303, 307, 308].includes(response.status))
            documents.add(redirect.href);
          headers.push({ name: 'Location', value: redirect.href });
        }
        // No cookies, credentials, source CSP overrides or arbitrary response headers are persisted.
        await cdp.send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: response.status,
          responseHeaders: headers,
          body: Buffer.from(response.html || '').toString('base64'),
        });
      } catch (error) {
        if (event.resourceType === 'Document') pageError = error;
        partial = true;
        await reject();
      }
    }
    cdp.onEvent = (message) => {
      if (message.method === 'Page.loadEventFired') loadedAt = Date.now();
      if (message.method === 'Fetch.requestPaused') {
        const task = paused(message.params);
        pending.add(task);
        task
          .catch(() => {
            partial = true;
          })
          .finally(() => pending.delete(task));
      }
    };
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    progress(20, 'navigation');
    try {
      await cdp.send('Page.navigate', { url: initial.url.href });
    } catch (error) {
      if (error.code !== 'CDP_TIMEOUT' || !main || cdp.closed) throw error;
      partial = true;
      timeoutStage = 'navigation';
    }
    while (Date.now() < deadline) {
      if (pageError) throw pageError;
      if (loadedAt && Date.now() - loadedAt >= 1500 && pending.size === 0) break;
      await delay(100);
    }
    if (!main) throw new scanner.ScanError('Halaman website gagal dibaca.', 502);
    if (Date.now() >= deadline) {
      partial = true;
      timeoutStage = timeoutStage || 'resources';
    }
    const accessRestricted = main.status >= 400;
    progress(65, 'runtime');
    const snapshot = accessRestricted
      ? { html: '', signals: {} }
      : await observation(runtimeExpression, { html: main.html || '', signals: {} }, 'runtime', 2000);
    progress(75, 'dom');
    const observations = accessRestricted
      ? { js: {}, dom: {}, meta: {}, scriptSrc: [] }
      : await observation(
          probe.expression(signatures.browserPlan()),
          { js: {}, dom: {}, meta: {}, scriptSrc: [], truncated: true },
          'dom',
          2500,
        );
    progress(85, 'signatures');
    const localDetections = await signatures.analyze({
      url: main.url.href,
      html: accessRestricted ? '' : (main.html || '') + '\n' + snapshot.html,
      headers: Object.fromEntries(
        Object.entries(main.headers).filter(
          ([name]) =>
            ![
              'set-cookie',
              'authorization',
              'proxy-authorization',
              'authentication-info',
              'proxy-authentication-info',
            ].includes(name.toLowerCase()),
        ),
      ),
      cookies: Object.fromEntries(
        (Array.isArray(main.headers['set-cookie']) ? main.headers['set-cookie'] : []).map((cookie) => [
          String(cookie).split('=', 1)[0].toLowerCase(),
          '',
        ]),
      ),
      js: accessRestricted ? {} : observations.js,
      dom: accessRestricted ? {} : observations.dom,
      meta: accessRestricted ? {} : observations.meta,
      scriptSrc: accessRestricted ? [] : observations.scriptSrc,
      scripts: accessRestricted
        ? []
        : [
            ...assets.filter((asset) => asset.kind === 'Script').map((asset) => asset.text),
            ...(observations.inlineScripts || []),
          ],
      css: accessRestricted
        ? []
        : assets.filter((asset) => asset.kind === 'Stylesheet').map((asset) => asset.text),
      xhr: accessRestricted ? [] : observedRequests,
    });
    partial = partial || accessRestricted || localDetections.partial || observations.truncated;
    const markerHints = runtimeTechnologies({ react: observations.react, angular: observations.angular });
    for (const hint of markerHints) hint.evidence = 'Browser DOM property marker: ' + hint.name;
    const headers = Object.fromEntries(
      profile.headerNames
        .filter((name) => typeof main.headers[name] === 'string')
        .map((name) => [name, main.headers[name].slice(0, 256)]),
    );
    return {
      url: main.url.href,
      status: main.status,
      scope: main.scope,
      scannedAt: new Date().toISOString(),
      mode: 'browser',
      accessRestricted,
      timeoutStage,
      partial,
      engine: localDetections.engine || {
        name: 'NIST Basis',
        signatures: signatures.load().count,
        revision: signatures.load().revision,
      },
      blockedRequests: blocked,
      assetsChecked: assets.length,
      htmlBytes: main.htmlBytes || 0,
      headers,
      technologies: mergeTechnologies(
        accessRestricted
          ? profile.detect(headers)
          : profile.detectPage(headers, main.html, main.headers['set-cookie'], assets),
        accessRestricted ? [] : profile.detectPage({}, snapshot.html),
        accessRestricted ? [] : runtimeTechnologies(snapshot.signals),
        accessRestricted ? [] : markerHints,
        localDetections.technologies,
      ),
    };
  } catch (error) {
    if (error.code === 'CDP_TIMEOUT')
      throw new scanner.ScanError(
        'Mode browser melewati batas waktu. Coba lagi atau gunakan scan standar.',
        504,
      );
    throw error;
  } finally {
    stopping = true;
    cdp?.close();
    chrome?.kill();
    if (chrome && chrome.exitCode === null)
      await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(2000)]);
    await Promise.allSettled([...pending]);
    if (
      path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) &&
      path.basename(directory).startsWith('nist-tech-render-')
    )
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
module.exports = { scan, runtimeTechnologies, mergeTechnologies };
