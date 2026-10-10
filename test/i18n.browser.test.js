const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

test('browser translates dynamic UI, preserves form values and user data, and restores both languages', async t => {
  const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  try { await fs.access(chromePath); } catch { t.skip('Chrome is unavailable'); return; }
  const script = await fs.readFile('frontend/public/i18n.js', 'utf8');
  const dashboard = (await fs.readFile('frontend/client/src/workspace/components/CsfView.vue', 'utf8'))
    .split('<template>')[1].split('<div class="page-heading"><div><p class="eyebrow">NIST CYBERSECURITY FRAMEWORK')[0];
  const server = http.createServer((req, res) => {
    if (req.url === '/i18n.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(script); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><script src="/i18n.js" defer></script></head><body>
      <div class="top-actions"></div><button id="save">Save</button>
      <select id="status"><option>Active</option><option value="closed">Closed</option></select>
      <input id="name" value="Save" placeholder="Masukkan username">
      <table><tbody><tr><td id="user-data">Save</td><td><button id="action">Delete</button></td></tr></tbody></table>
      <select id="asset-status"><option value="planned">planned</option></select>
      <h2 id="asset-heading">Rak Server</h2>
      <table><tbody><tr><td data-translate-ui id="asset-cia">High (25)</td><td data-translate-ui id="asset-state">planned</td><td id="asset-name">Save</td></tr></tbody></table>
      <p id="asset-error">Aset sudah dipakai: Terpasang di rakGTI (U24-U25). Gunakan Ubah posisi atau drag-and-drop untuk memindahkannya.</p>
      <p id="dynamic"></p><pre id="result"></pre>
      <span data-no-translate id="note-title">Save</span>
      <table><tbody><tr><td colspan="2" id="empty">No risks found.</td></tr></tbody></table>
      <p id="module-counter">24 policies</p>
      ${dashboard}
      <script>document.addEventListener('DOMContentLoaded', async () => {
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const tick = () => new Promise(resolve => setTimeout(resolve, 30));
        try {
          NistI18n.setLanguage('id');
          check(save.textContent === 'Simpan', 'Indonesian label');
          check(document.getElementById('asset-heading').textContent === 'Rak Server', 'rack title Indonesian');
          check(document.getElementById('asset-cia').textContent === 'Tinggi (25)', 'CIA table Indonesian');
          check(document.getElementById('asset-state').textContent === 'Direncanakan', 'asset lifecycle Indonesian');
          check(document.getElementById('asset-status').value === 'planned', 'asset lifecycle stored value');
          check(document.getElementById('asset-name').textContent === 'Save', 'asset name preserved');
          check(document.getElementById('status').value === 'Active', 'implicit option value');
          check(document.getElementById('name').value === 'Save', 'input data');
          check(document.getElementById('user-data').textContent === 'Save', 'table data');
          check(document.getElementById('action').textContent === 'Hapus', 'table action');
          check(document.getElementById('note-title').textContent === 'Save', 'note title preserved');
          check(document.getElementById('empty').textContent === 'Belum ada risiko.', 'empty table message');
          check(document.getElementById('module-counter').textContent === '24 kebijakan', 'module counter');
          check(document.querySelector('#csfView h2').textContent === 'Pusat Kontrol CSF 2.0', 'dashboard title');
          check(document.getElementById('completionDetail').textContent === '0 dari 24 kontrol telah dinilai', 'dashboard counter');
          document.getElementById('csfSummaryBody').innerHTML = '<tr><td data-translate-ui>Overall Average Score</td><td>3.4</td></tr>';
          await tick();
          check(document.querySelector('#csfSummaryBody td').textContent === 'Skor rata-rata keseluruhan', 'dashboard summary');
          dynamic.textContent = 'Save'; await tick();
          check(dynamic.textContent === 'Simpan', 'dynamic translation');
          const select = document.querySelector('[data-language-select]'); select.value = 'en'; select.dispatchEvent(new Event('change'));
          check(document.documentElement.lang === 'en', 'document language');
          check(document.getElementById('asset-heading').textContent === 'Server Racks', 'rack title English');
          check(document.getElementById('asset-cia').textContent === 'High (25)', 'CIA table English');
          check(document.getElementById('asset-status').value === 'planned', 'asset value after language switch');
          check(document.getElementById('asset-error').textContent === 'Device already in use: Installed in rakGTI (U24-U25). Use Edit position or drag and drop to move it.', 'rack error translated');
          check(save.textContent === 'Save' && dynamic.textContent === 'Save', 'restore original');
          check(document.getElementById('empty').textContent === 'No risks found.', 'English empty table message');
          check(document.getElementById('module-counter').textContent === '24 policies', 'English module counter');
          check(document.querySelector('#csfView h2').textContent === 'CSF 2.0 Control Room', 'dashboard English');
          document.getElementById('completionDetail').textContent = '17 of 106 controls scored'; await tick();
          NistI18n.setLanguage('id');
          check(document.getElementById('completionDetail').textContent === '17 dari 106 kontrol telah dinilai', 'updated dashboard counter');
          NistI18n.setLanguage('en');
          check(document.getElementById('name').placeholder === 'Enter your username', 'placeholder');
          check(localStorage.getItem('nist-basis-language') === 'en', 'persistent preference');
          dynamic.textContent = 'Batal'; await tick(); check(dynamic.textContent === 'Cancel', 'dynamic Indonesian source');
          NistI18n.setLanguage('id'); check(dynamic.textContent === 'Batal', 'restore dynamic');
          const large = document.createElement('div');
          large.innerHTML = '<span>Save</span>'.repeat(2000);
          document.body.append(large); await tick();
          const scanned = [];
          const createWalker = document.createTreeWalker.bind(document);
          document.createTreeWalker = (root, ...args) => { scanned.push(root); return createWalker(root, ...args); };
          const added = document.createElement('button'); added.textContent = 'Delete';
          large.append(added); large.firstChild.remove(); await tick();
          check(added.textContent === 'Hapus', 'new item translated in large list');
          check(!scanned.includes(large) && !scanned.includes(document.body), 'list updates do not rescan unchanged siblings');
          document.createTreeWalker = createWalker;
          result.textContent = 'BROWSER_I18N_PASS';
        } catch (error) { result.textContent = 'BROWSER_I18N_FAIL: ' + error.message; }
      });</script></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-i18n-browser-'));
  t.after(async () => {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('nist-i18n-browser-')) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--dump-dom', '--virtual-time-budget=2000', `http://127.0.0.1:${server.address().port}`], { windowsHide: true });
  let output = '';
  chrome.stdout.on('data', chunk => { output += chunk; });
  chrome.stderr.resume();
  const timeout = setTimeout(() => chrome.kill(), 20000);
  await new Promise((resolve, reject) => { chrome.once('error', reject); chrome.once('close', resolve); });
  clearTimeout(timeout);
  assert.match(output, /<pre id="result">BROWSER_I18N_PASS<\/pre>/, output.match(/BROWSER_I18N_FAIL:[^<]+/)?.[0] || 'Browser did not finish the checks');
});
