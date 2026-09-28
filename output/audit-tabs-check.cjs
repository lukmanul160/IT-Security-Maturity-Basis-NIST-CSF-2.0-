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

async function run() {
  const chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profilePath}`,'about:blank'],{stdio:'ignore',windowsHide:true});
  let client;
  try {
    await waitForChrome();
    const target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl+'/login')}`,{method:'PUT'})).json();
    client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
    await waitFor(client,`document.querySelector('#loginForm')`,'login');
    await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);
    await waitFor(client,`document.documentElement.dataset.frontend==='vue' && document.querySelector('#aftDashboardTab')`,'workspace');await delay(1000);
    await evaluate(client,`document.querySelector('[data-view="audit-finding-tracker"]').click()`);
    await waitFor(client,`!document.querySelector('#aftNew').disabled`,'tracker');
    assert.deepEqual(await evaluate(client,`Array.from(document.querySelectorAll('[data-aft-tab]')).map(b=>b.textContent)`),['1. Dashboard','2. Setting SMTP','3. Kelola Audit']);
    assert.equal(await evaluate(client,`!document.querySelector('#aftDashboardPanel').hidden && document.querySelector('#aftManagePanel').hidden`),true);
    for (const tab of ['dashboard','smtp','manage']) {
      await evaluate(client,`document.querySelector('[data-aft-tab="${tab}"]').click()`);
      const active=await evaluate(client,`Array.from(document.querySelectorAll('#auditFindingView [role="tabpanel"]')).filter(p=>!p.hidden).map(p=>p.id)`);
      assert.deepEqual(active,[{dashboard:'aftDashboardPanel',smtp:'aftSmtpPanel',manage:'aftManagePanel'}[tab]]);
      if(tab==='smtp')await waitFor(client,`document.querySelector('#aftReminderStatus').textContent==='Pengaturan siap diedit.'`,'SMTP settings');
      for(const width of [1440,768,390]) {
        await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await delay(80);
        assert.equal(await evaluate(client,`document.documentElement.scrollWidth>document.documentElement.clientWidth+1`),false,`${tab} overflow ${width}`);
      }
    }
    await evaluate(client,`document.querySelector('#aftNew').click()`);assert.equal(await evaluate(client,`document.querySelector('#aftModal').open`),true);await evaluate(client,`document.querySelector('#aftCancel').click()`);
    await evaluate(client,`document.querySelector('#aftDashboardTab').focus()`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    assert.equal(await evaluate(client,`document.querySelector('#aftSmtpTab').getAttribute('aria-selected')`),'true');
    await evaluate(client, `(() => {
      const make=(id,kind,parentId,title,status='Open',dueDate='')=>({id,kind,parentId,data:{title,status,dueDate,owner:'Demo PIC',description:'',reference:'',severity:'High'}});
      const records=[make('a1','audit',null,'Audit A','Open','2000-01-01'),make('a2','audit',null,'Audit B','Closed','2000-01-01'),make('f1','finding','a1','Finding pending','Open','2000-01-01'),make('f2','finding','a2','Finding active','In progress','2099-01-01'),make('f3','finding','a1','Finding closed','Closed','2000-01-01'),make('u1','followup','f2','Action'),make('e1','evidence','u1','Proof')];
      const original=window.fetch;window.fetch=(input,options)=>String(input)==='/api/audit-finding-tracker' && (!options?.method || options.method==='GET') ? Promise.resolve(new Response(JSON.stringify(records),{status:200,headers:{'Content-Type':'application/json'}})) : original(input,options);
      document.querySelector('[data-view="audit-finding-tracker"]').click();
    })()`);
    await waitFor(client, `document.querySelector('#aftAuditCount').textContent==='2' && !document.querySelector('#aftNew').disabled`, 'fixture dashboard');
    for(const [card,expected] of [['audits',['Audit A','Audit B']],['open-findings',['Finding pending','Finding active']],['followups',['Action']],['evidence',['Proof']],['overdue-audits',['Audit A']],['overdue-findings',['Finding pending']]]) {
      await evaluate(client, `document.querySelector('#aftDashboardTab').click();document.querySelector('[data-aft-card="${card}"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftManagePanel').hidden`),false);
      assert.deepEqual(await evaluate(client, `Array.from(document.querySelectorAll('#aftBody > tr')).map(row=>row.cells[0].firstChild.textContent)`),expected);
    }
    await evaluate(client, `document.querySelector('[data-aft-open="f1"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#aftNew').textContent`),'Tambah Follow-up');
    assert.ok(await evaluate(client, `document.querySelector('#aftContext').textContent.includes('Audit A')`));
    await evaluate(client, `document.querySelector('#aftDashboardTab').click();document.querySelector('[data-aft-card="followups"]').click();document.querySelector('[data-aft-open="u1"]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#aftNew').textContent`),'Tambah Evidence');
    assert.ok(await evaluate(client, `document.querySelector('#aftContext').textContent.includes('Finding active')`));
    await evaluate(client, `document.querySelector('#aftBreadcrumb [data-aft-level="0"]').click()`);
    assert.equal(await evaluate(client, `document.querySelectorAll('#aftBody > tr').length`),2);
    await evaluate(client, `document.querySelector('#aftDashboardTab').click();document.querySelector('[data-aft-card="open-findings"]').focus()`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});
    assert.equal(await evaluate(client, `document.querySelector('#aftManagePanel').hidden`),false);
    await evaluate(client, `document.querySelector('#aftSearch').value='does not exist';document.querySelector('#aftSearch').dispatchEvent(new Event('input'))`);
    assert.ok(await evaluate(client, `document.querySelector('#aftBody').textContent.includes('Belum ada data')`));
    console.log('PASS: 3 tabs, all 6 card filters, correct finding/follow-up ancestors, breadcrumb reset, empty search, keyboard activation, responsive layouts. Fixture data only; no records or emails created.');
  } finally {client?.close();chrome.kill();await delay(1000);await removeBrowserProfile();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
