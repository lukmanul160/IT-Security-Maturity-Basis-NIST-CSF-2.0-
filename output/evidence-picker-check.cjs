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
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profilePath}`,'about:blank'],{stdio:'ignore',windowsHide:true});let client;
 try{
  await waitForChrome();const target=await(await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl+'/login')}`,{method:'PUT'})).json();client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const original=window.fetch;window.evidenceScenario='alice';window.fetch=async(input,options)=>{if(String(input)==='/api/files?details=true'){const all=[{name:'Alice-only.pdf',path:'upload/Govern/Policy/alice/file.pdf',source:'Uploaded files'},{name:'Bob-only.pdf',path:'upload/ISO 27001/Policy/bob/file.pdf',source:'Uploaded files'}];return new Response(JSON.stringify(window.evidenceScenario==='admin'?all:window.evidenceScenario==='empty'?[]:[all[0]]),{status:200,headers:{'Content-Type':'application/json'}});}return original(input,options);};})();`});
  await waitFor(client,`document.querySelector('#loginForm')`,'login');await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);
  await waitFor(client,`document.documentElement.dataset.frontend==='vue' && document.querySelector('[data-view="csf"]')`,'workspace');await delay(1200);
  for(const [view,tabSelector,tab,selector,pickerAttribute,toggleAttribute] of [
   ['csf','data-csf-tab','core','data-toggle-existing','data-existing-picker','data-toggle-existing'],
   ['privacy','data-privacy-tab','core','data-toggle-privacy-existing','data-privacy-existing-picker','data-toggle-privacy-existing'],
   ['iso27001','data-iso-tab','clauses','data-toggle-iso-existing','data-iso-existing-picker','data-toggle-iso-existing'],
   ['iso27001','data-iso-tab','soa','data-toggle-iso-existing','data-iso-existing-picker','data-toggle-iso-existing']
  ]){
   await evaluate(client,`document.querySelector('[data-view="${view}"]').click();document.querySelector('[${tabSelector}="${tab}"]').click()`);
   await waitFor(client,`Array.from(document.querySelectorAll('[${selector}]')).some(b=>b.getClientRects().length)`,'visible '+view+' picker');
   for(const scenario of ['alice','admin','empty']){
    await evaluate(client,`window.evidenceScenario='${scenario}';window.pickerButton=Array.from(document.querySelectorAll('[${selector}]')).find(b=>b.getClientRects().length);window.pickerKey=pickerButton.getAttribute('${toggleAttribute}');pickerButton.click()`);
    const expression=`Array.from(document.querySelectorAll('[${pickerAttribute}]')).find(p=>p.getAttribute('${pickerAttribute}')===window.pickerKey)`;
    await waitFor(client,`(${expression}).querySelectorAll('.existing-file-option').length===${scenario==='admin'?2:scenario==='empty'?0:1}`,'scoped options '+scenario);
    const text=await evaluate(client,`(${expression}).textContent`);
    assert.equal(text.includes('Alice-only.pdf'),scenario!=='empty');assert.equal(text.includes('Bob-only.pdf'),scenario==='admin');
   }
  }
  console.log('PASS: CSF, Privacy, ISO clauses and SOA use only server-scoped library; admin sees both users; empty results clear old files. No data written.');
 }finally{client?.close();chrome.kill();await delay(1000);await removeBrowserProfile();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
