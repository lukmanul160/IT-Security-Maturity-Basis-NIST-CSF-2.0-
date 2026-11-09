// Offline rendering audit of every component's authored controls. No app server,
// credentials, database or module actions are used by this fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { parse, compileStyle } = require('@vue/compiler-sfc');
const { Cdp } = require('./test-threat-modelling-browser');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const directory = 'frontend/client/src/workspace/components';
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.vue'));
  let markup = '',
    styles = '';
  for (const [index, file] of files.entries()) {
    const { descriptor } = parse(await fs.readFile(path.join(directory, file), 'utf8'));
    const id = `data-v-audit${index}`;
    styles += descriptor.styles
      .map((style) => compileStyle({ source: style.content, id, scoped: style.scoped }).code)
      .join('\n');
    const template = (descriptor.template?.content || '')
      .replace(/\{\{\s*t\('([^']+)'\)\s*\}\}/g, '$1')
      .replace(/\{\{[\s\S]*?\}\}/g, '')
      .replace(/<\/?template\b[^>]*>/gi, '')
      .replace(/<([\w-]+)(\s[^>]*?)?\s*\/>/g, (tag, name, attrs = '') =>
        /^(input|img|br|hr|meta|link|source|area|wbr)$/i.test(name) ? tag : `<${name}${attrs}></${name}>`,
      )
      .replace(/<([a-z][\w-]*)(?=[\s>])/gi, `<$1 ${id}`);
    markup += `<section data-component="${file}">${template}</section>`;
  }
  // Match main.js import order, including the legacy rules behind toolbar buttons.
  const main = await fs.readFile('frontend/client/src/main.js', 'utf8');
  let shared = '';
  for (const match of main.matchAll(/import '([^']+\.css)';/g)) {
    shared += await fs.readFile(path.resolve('frontend/client/src', match[1]), 'utf8');
  }
  const i18n = await fs.readFile('frontend/public/i18n.js', 'utf8');
  const theme = await fs.readFile('frontend/public/theme.js', 'utf8');
  const publicPages = new Map();
  for (const [url, file] of [
    ['/landing', 'landing.html'],
    ['/login', 'login.html'],
    ['/office', 'virtual-office/index.html'],
  ]) {
    publicPages.set(
      url,
      (await fs.readFile(`frontend/public/${file}`, 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace('</body>', '<script src="/i18n.js"></script><script src="/theme.js"></script></body>'),
    );
  }
  const cssAssets = new Map();
  for (const asset of ['theme.css', 'tailwind.css', 'virtual-office/assets/office.css'])
    cssAssets.set('/' + asset, await fs.readFile('frontend/public/' + asset, 'utf8'));
  const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${shared}\n${styles}</style></head><body class="workspace-ui">${markup}
    <div class="toolbar" id="regression-toolbar"><button class="button button-accent">Simpan</button><button class="button button-danger">Hapus</button><button class="button button-quiet">Batal</button><button class="button button-quiet" role="tab" aria-selected="true">Dashboard</button></div>
    <script src="/i18n.js"></script><script src="/theme.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/i18n.js' || req.url === '/theme.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(req.url === '/i18n.js' ? i18n : theme);
      return;
    }
    if (cssAssets.has(req.url)) {
      res.setHeader('Content-Type', 'text/css');
      res.end(cssAssets.get(req.url));
      return;
    }
    if (req.url !== '/' && !publicPages.has(req.url)) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(publicPages.get(req.url) || html);
  });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-controls-'));
  let chrome, cdp;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = 10100 + Math.floor(Math.random() * 300);
    chrome = spawn(
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        target = await (
          await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        ).json();
        break;
      } catch {
        await delay(100);
      }
    }
    assert.ok(target, 'Chrome is available');
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    try {
      await cdp.wait('window.NistI18n && window.NistTheme');
    } catch (error) {
      throw Error(
        error.message +
          JSON.stringify({
            errors: cdp.errors,
            dom: await cdp.evaluate(
              '({scripts:[...document.scripts].map(s=>s.src),tail:document.body.innerHTML.slice(-1200),url:location.href})',
            ),
          }),
      );
    }
    const auditSource = `window.auditControls = () => {
      const rgb = value => (value.match(/[0-9.]+/g) || []).map(Number);
      const luminance = channels => channels.slice(0,3).map(x => x/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
      const background = element => { const stack=[]; for(let node=element;node;node=node.parentElement)stack.unshift(rgb(getComputedStyle(node).backgroundColor));let result=[255,255,255];for(const color of stack){const alpha=color[3]??1;result=result.map((x,i)=>(color[i]||0)*alpha+x*(1-alpha));}return result; };
      return [...document.querySelectorAll('button,a.button')].filter(e=>e.textContent.trim()&&!e.disabled).map(e=>{const style=getComputedStyle(e),fg=luminance(rgb(style.color));const stops=style.backgroundImage.startsWith('linear-gradient')?style.backgroundImage.match(/rgba?\([^)]+\)/g):null;const backgrounds=stops?.length?stops.map(color=>rgb(color)): [background(e)];const contrast=Math.min(...backgrounds.map(color=>{const bg=luminance(color);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);}));return {component:e.closest('[data-component]')?.dataset.component||'regression',text:e.textContent.trim().slice(0,90),classes:e.className,contrast};});
    }`;
    await cdp.evaluate(auditSource);
    const report = [];
    for (const language of ['id', 'en'])
      for (const mode of ['light', 'dark']) {
        await cdp.evaluate(`NistI18n.setLanguage('${language}');NistTheme.set('${mode}')`);
        await delay(250);
        const controls = await cdp.evaluate('auditControls()');
        assert.equal(
          await cdp.evaluate(
            `getComputedStyle(document.querySelector('#regression-toolbar [aria-selected=true]')).color`,
          ),
          'rgb(255, 255, 255)',
          'Selected tabs retain their contrasting active appearance',
        );
        report.push({
          language,
          mode,
          count: controls.length,
          failures: controls.filter((control) => control.contrast < 4.5),
        });
        assert.ok(controls.length > 300, 'Audit covers shared buttons across all modules');
      }
    for (const url of publicPages.keys()) {
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${url}` });
      await cdp.wait('window.NistI18n && window.NistTheme');
      await cdp.evaluate(auditSource);
      for (const language of ['id', 'en'])
        for (const mode of ['light', 'dark']) {
          await cdp.evaluate(`NistI18n.setLanguage('${language}');NistTheme.set('${mode}')`);
          await delay(250);
          const controls = await cdp.evaluate('auditControls()');
          assert.ok(controls.length > 0, 'Public page controls are rendered');
          report.push({
            page: url,
            language,
            mode,
            count: controls.length,
            failures: controls.filter((control) => control.contrast < 4.5),
          });
        }
    }
    await fs.mkdir('output', { recursive: true });
    await fs.writeFile(
      'output/shared-controls-audit.json',
      JSON.stringify({ components: files.length, report }, null, 2),
    );
    assert.deepEqual(
      report.flatMap((item) =>
        item.failures.map((failure) => ({ mode: item.mode, language: item.language, ...failure })),
      ),
      [],
      'Enabled button labels need 4.5:1 contrast',
    );
    console.log(
      JSON.stringify({
        components: files.length,
        combinations: report.map(({ language, mode, count }) => ({ language, mode, count })),
      }),
    );
  } finally {
    cdp?.socket.close();
    chrome?.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await delay(500);
    if (
      path.dirname(profile) === path.resolve(os.tmpdir()) &&
      path.basename(profile).startsWith('nist-controls-')
    )
      await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
