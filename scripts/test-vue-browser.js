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
  await fs.access(chromePath);
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let client;
    const errors = [];
    const failedResponses = [];
    const legacyResourceRequests = [];
  try {
    await waitForChrome();
    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: 'PUT' });
    const target = await targetResponse.json();
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.text || 'Uncaught browser exception'));
    client.on('Runtime.consoleAPICalled', event => {
      if (event.type === 'error') errors.push(event.args?.map(item => item.value || item.description).join(' ') || 'console.error');
    });
    client.on('Network.responseReceived', event => {
      const { status, url } = event.response || {};
      if (status >= 400 && !url.endsWith('/favicon.ico') && !(status === 401 && url.endsWith('/api/auth/me'))) failedResponses.push(`${status} ${url}`);
    });
    client.on('Network.requestWillBeSent', event => {
      if (/\/app\.js(?:\?|$)/.test(event.request?.url || '')) legacyResourceRequests.push(event.request.url);
    });
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Page.enable'),
      client.send('Network.enable'),
    ]);

    await waitFor(client, `document.querySelector('#loginForm')`, 'login form');
    await evaluate(client, `(() => {
      document.querySelector('#username').value = ${JSON.stringify(username)};
      document.querySelector('#password').value = ${JSON.stringify(password)};
      document.querySelector('#loginForm').requestSubmit();
      return true;
    })()`);
    await waitFor(client, `location.pathname === '/' && document.documentElement.dataset.frontend === 'vue'`, 'Vue workspace', 25000);
    await waitFor(client, `document.querySelectorAll('.nav-item').length > 10`, 'workspace navigation');
    await delay(1500);

    const runtime = await evaluate(client, `({
      vue: Boolean(document.querySelector('#app').__vue_app__),
      workspaceRuntime: window.__NIST_WORKSPACE_RUNTIME__ === true,
      title: document.title,
      navCount: document.querySelectorAll('.nav-item').length,
      viewCount: document.querySelectorAll('.view').length,
      main: Boolean(document.querySelector('#mainContent')),
      duplicateIds: [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
    })`);
    assert.equal(runtime.vue, true);
    assert.equal(runtime.workspaceRuntime, true);
    assert.equal(runtime.main, true);
    assert.ok(runtime.navCount >= 15);
    assert.ok(runtime.viewCount >= 15);
    assert.deepEqual(runtime.duplicateIds, []);
    assert.deepEqual(await evaluate(client, `fetch('/index.html').then(response => response.text()).then(html => html.includes('/vue/assets/'))`), true);

    const views = ['framework', 'csf', 'csf-manage', 'privacy', 'privacy-manage', 'iso27001', 'risk-acceptance', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'backups'];
    for (const view of views) {
      const opened = await evaluate(client, `(() => { const button = document.querySelector('[data-view="${view}"]'); if (!button || button.hidden || button.disabled) return false; button.click(); return true; })()`);
      assert.equal(opened, true, `Navigation unavailable: ${view}`);
      await delay(180);
    }
    assert.equal(await evaluate(client, `(() => { const button = document.querySelector('#accountButton'); if (!button || button.hidden || button.disabled) return false; button.click(); return document.querySelector('#accountView').classList.contains('active-view'); })()`), true, 'Account navigation unavailable');
    assert.deepEqual(await evaluate(client, `([...document.querySelectorAll('#accountView [data-account-tab]')].map(button => button.textContent.trim()))`), ['1. Account Management', '2. ROLE ACCESS', '3. ADMINISTRATION', '4. AUDIT TRAIL'], 'Account tabs are incomplete');
    assert.equal(await evaluate(client, `(() => { const button = document.querySelector('#accountView [data-account-tab="audit"]'); button?.click(); return document.querySelector('#accountAuditPanel')?.hidden === false && document.querySelector('#accountProfilePanel')?.hidden === true; })()`), true, 'Account audit tab unavailable');
    assert.equal(await evaluate(client, `(() => { document.querySelector('#accountView [data-account-tab="profile"]')?.click(); return document.querySelector('#accountProfilePanel')?.hidden === false; })()`), true, 'Account profile tab unavailable');

    await evaluate(client, `document.querySelector('[data-view="personnel-certification"]').click()`);
    await waitFor(client, `document.querySelectorAll('[data-personnel-tab]').length === 3`, 'personnel tabs');
    for (const tab of ['organization', 'map', 'reference']) {
      assert.equal(await evaluate(client, `(() => { const button = document.querySelector('[data-personnel-tab="${tab}"]'); button.click(); return !button.hidden; })()`), true);
    }

    for (const [view, selector, values] of [
      ['csf', 'data-csf-tab', ['overview', 'core']],
      ['privacy', 'data-privacy-tab', ['overview', 'core']],
      ['iso27001', 'data-iso-tab', ['dashboard', 'objectives', 'objective-calendar', 'clauses', 'soa']],
      ['risk-management', 'data-risk-tab', ['register', 'indicators']],
    ]) {
      await evaluate(client, `document.querySelector('[data-view="${view}"]').click()`);
      for (const value of values) {
        assert.equal(await evaluate(client, `(() => { const button = document.querySelector('[${selector}="${value}"]'); if (!button) return false; button.click(); return true; })()`), true, `Tab unavailable: ${view}/${value}`);
      }
    }

    for (const [view, buttonId, modalId, cancelId] of [
      ['csf-manage', 'csfManageNewButton', 'csfManageModal', 'csfFormCancel'],
      ['privacy-manage', 'privacyManageNewButton', 'privacyManageModal', 'privacyFormCancel'],
      ['iso27001', 'iso27001NewButton', 'iso27001Modal', 'iso27001FormCancel'],
      ['personnel-certification', 'organizationPersonnelNewButton', 'organizationPersonnelModal', 'organizationPersonnelCancel'],
    ]) {
      await evaluate(client, `document.querySelector('[data-view="${view}"]').click()`);
      const modalOpened = await evaluate(client, `(() => { const button = document.querySelector('#${buttonId}'); if (!button || button.hidden || button.disabled) return false; button.click(); return document.querySelector('#${modalId}').open; })()`);
      assert.equal(modalOpened, true, `Modal unavailable: ${modalId}`);
      await evaluate(client, `document.querySelector('#${cancelId}').click()`);
    }

    await evaluate(client, `document.querySelector('[data-view="policy-register"]').click()`);
    await evaluate(client, `document.querySelector('#policyRegisterNewButton').click()`);
    await waitFor(client, `document.querySelector('#policyRegisterModal').open`, 'Policy Register modal');
    await evaluate(client, `document.querySelector('#policyRegisterCancel').click()`);

    await evaluate(client, `document.querySelector('[data-view="files"]').click()`);
    await waitFor(client, `document.querySelector('#uploadedFilesBody')`, 'Uploaded Files table');
    const editResult = await evaluate(client, `(() => {
      const edit = document.querySelector('[data-uploaded-file-edit]');
      if (!edit) return 'empty';
      edit.click();
      return document.querySelector('#uploadedFileEditModal').open ? 'file-modal' : document.querySelector('#policyRegisterModal').open ? 'policy-modal' : 'missing-modal';
    })()`);
    assert.notEqual(editResult, 'missing-modal');
    await evaluate(client, `document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close())`);

    for (const width of [1440, 768, 390]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await delay(150);
      const overflow = await evaluate(client, `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
      assert.equal(overflow, false, `Document overflow at ${width}px`);
    }

    assert.deepEqual(errors, [], `Browser errors:\n${errors.join('\n')}`);
    assert.deepEqual(failedResponses, [], `Failed HTTP responses:\n${failedResponses.join('\n')}`);
    assert.deepEqual(legacyResourceRequests, [], `Browser loaded old public/app.js:\n${legacyResourceRequests.join('\n')}`);
    console.log(JSON.stringify({ status: 'passed', runtime, viewsChecked: views.length, uploadedFileEdit: editResult, viewports: [1440, 768, 390] }, null, 2));
  } finally {
    client?.close();
    chrome.kill();
    await Promise.race([
      new Promise(resolve => chrome.once('exit', resolve)),
      delay(1500),
    ]);
    await removeBrowserProfile();
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
