const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.APP_URL || 'http://localhost:8000';
const username = process.env.BROWSER_TEST_USER || 'admin';
const password = process.env.BROWSER_TEST_PASSWORD || 'admin';
const debugPort = 9300 + Math.floor(Math.random() * 500);
const profilePath = path.join(os.tmpdir(), `nist-vue-browser-${process.pid}-${Date.now()}`);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function removeBrowserProfile() {
  const resolvedProfile = path.resolve(profilePath);
  if (path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) || !path.basename(resolvedProfile).startsWith('nist-vue-browser-')) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(resolvedProfile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 19) {
        console.warn(`[browser-test] Temporary profile cleanup skipped: ${error.message}`);
        return;
      }
      await delay(250);
    }
  }
}

async function waitForChrome() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result.value;
}

async function waitFor(client, expression, label, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function captureGuide() {
  const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port='+debugPort, '--user-data-dir='+profilePath, 'about:blank'], {stdio:'ignore', windowsHide:true});
  let client;
  const screenshots = [], errors = [];
  try {
    await waitForChrome();
    const target = await (await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(baseUrl+'/'), {method:'PUT'})).json();
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect(); await client.send('Page.enable'); await client.send('Runtime.enable');
    client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.text));
    await client.send('Emulation.setDeviceMetricsOverride', {width:1600,height:1100,deviceScaleFactor:1,mobile:false});
    await fs.mkdir('output/feature-guide/screenshots', {recursive:true});
    const snap = async (slug,title) => {
      await delay(650);
      await evaluate(client, 'window.scrollTo(0,0); document.querySelector("#mainContent")?.scrollTo(0,0)');
      await delay(100);
      const shot = await client.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      await fs.writeFile('output/feature-guide/screenshots/'+slug+'.png', Buffer.from(shot.data,'base64'));
      screenshots.push({slug,title,file:'screenshots/'+slug+'.png'}); console.log('Captured '+title);
    };
    await waitFor(client,'document.querySelector(".hero")','landing');
    await snap('01-beranda','Beranda dan model 3D interaktif');
    await client.send('Page.navigate',{url:baseUrl+'/login'});
    await waitFor(client,'document.querySelector("#loginForm")','login');
    await snap('02-login','Login');
    await evaluate(client, `document.querySelector('#username').value=${JSON.stringify(username)}; document.querySelector('#password').value=${JSON.stringify(password)}; document.querySelector('#loginForm').requestSubmit();`);
    await waitFor(client,'location.pathname === "/app" && document.documentElement.dataset.frontend === "vue"','workspace',30000);
    await delay(1800);
    const view = async key => { await evaluate(client,`document.querySelector('[data-view="${key}"]').click()`); await delay(400); };
    const tab = async (attr,value) => { await evaluate(client,`document.querySelector('[${attr}="${value}"]').click()`); await delay(200); };
    await view('framework'); await snap('03-framework','Pemilihan framework');
    await view('csf'); await tab('data-csf-tab','overview'); await snap('04-csf-dashboard','Dashboard NIST CSF');
    await tab('data-csf-tab','core'); await snap('05-csf-core','NIST CSF Core');
    await view('privacy'); await tab('data-privacy-tab','overview'); await snap('06-privacy-dashboard','Dashboard NIST Privacy');
    await tab('data-privacy-tab','core'); await snap('07-privacy-core','Privacy Core dan assessment');
    await view('iso27001');
    for(const [key,slug,title] of [['dashboard','08-iso-dashboard','Dashboard ISO 27001'],['objectives','09-iso-objectives','Sasaran keamanan informasi'],['objective-calendar','10-iso-calendar','Kalender evaluasi ISO'],['clauses','11-iso-clauses','ISO Clauses 4–10'],['soa','12-iso-soa','Statement of Applicability']]) { await tab('data-iso-tab',key); await snap(slug,title); }
    await view('risk-acceptance'); await snap('13-risk-acceptance','Risk Acceptance');
    await view('risk-management'); await tab('data-risk-tab','register'); await snap('14-risk-management','Risk Management');
    await tab('data-risk-tab','indicators'); await snap('15-risk-indicators','Indikator risiko');
    await view('policy-register'); await tab('data-policy-tab','register'); await snap('16-policy-register','Policy Register');
    await tab('data-policy-tab','calendar'); await snap('17-policy-calendar','Kalender review kebijakan');
    await view('personnel-certification');
    for(const [key,slug,title] of [['organization','18-personnel','Daftar pegawai'],['map','19-certifications','Sertifikasi pegawai'],['reference','20-roadmap','Referensi roadmap sertifikasi']]) { await tab('data-personnel-tab',key); await snap(slug,title); }
    for(const [key,slug,title] of [['tprm','21-tprm','TPRM Framework'],['tprm-tiering','22-tiering','Vendor Tiering Matrix'],['tprm-questionnaire','23-questionnaire','Due Diligence Questionnaire'],['questionnaire-templates','24-templates','Questionnaire Templates'],['tprm-register','25-tprm-register','TPRM Risk Register'],['files','26-evidence','Uploaded Files'],['backups','27-backup','Database Backup']]) { await view(key); await snap(slug,title); }
    await evaluate(client,'document.querySelector("#accountButton").click()');
    for(const [key,slug,title] of [['profile','28-account','Profil akun'],['permissions','29-permissions','Role Access'],['users','30-users','Administrasi akun'],['audit','31-audit','Audit Trail']]) { await tab('data-account-tab',key); await snap(slug,title); }
  } finally {
    await fs.writeFile('output/feature-guide/manifest.json',JSON.stringify({capturedAt:new Date().toISOString(),viewport:'1600 × 1100',screenshots,browserErrors:errors},null,2));
    client?.close(); chrome.kill(); await delay(500); await removeBrowserProfile();
  }
}
captureGuide().catch(error => { console.error(error); process.exitCode=1; });
