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

(async()=>{
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});let client;const errors=[];
 try{
  await waitForChrome();const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(baseUrl+'/login'),{method:'PUT'})).json();
  client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Page.enable');await client.send('Runtime.enable');
  client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text));
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=window.fetch.bind(window);window.smtpTestWrites=[];let smtp={host:'smtp.example.com',port:587,security:'starttls',username:'demo',from:'sender@example.com',hasPassword:true,configured:true};let reminder={enabled:false,daysBefore:30,owners:[],subjectTemplate:'Review {{title}}',bodyTemplate:'Halo {{owner}}',smtpConfigured:true};window.fetch=async(url,options={})=>{const path=new URL(url,location.href).pathname;if(path.startsWith('/api/smtp-settings')||path.startsWith('/api/policy-register/reminder-settings')){if(path.endsWith('/test'))throw new Error('Email sending disabled in UI test');if(options.method==='PUT'){const body=JSON.parse(options.body);window.smtpTestWrites.push({path,body});if(path==='/api/smtp-settings')smtp={...smtp,...body};else reminder={...reminder,...body};}return new Response(JSON.stringify(path==='/api/smtp-settings'?smtp:reminder),{status:200,headers:{'Content-Type':'application/json'}})}return original(url,options)}})()`});
  await waitFor(client,'document.querySelector("#loginForm")','login');
  await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit();`);
  await waitFor(client,'document.documentElement.dataset.frontend==="vue"','workspace',30000);await delay(1000);
  await evaluate(client,`document.querySelector('[data-view="policy-register"]').click();document.querySelector('#policySmtpOpen').click()`);
  await waitFor(client,'!document.querySelector("#policySmtpDays").disabled','reminder loaded');
  assert.equal(await evaluate(client,'document.querySelector("#policySmtpPanel #policySmtpHost")===null'),true);
  await evaluate(client,'document.querySelector("#policyOpenGlobalSmtp").click()');
  await waitFor(client,'!document.querySelector("#globalSmtpHost").disabled && document.querySelector("#globalSmtpHost").value === "smtp.example.com"','central settings');
  assert.equal(await evaluate(client,'!document.querySelector("#accountSmtpPanel").hidden && document.querySelector("#accountView").classList.contains("active-view")'),true);
  await evaluate(client,'document.querySelector("#globalSmtpHost").value="new.example.com";document.querySelector("#globalSmtpForm").requestSubmit()');
  await waitFor(client,'window.smtpTestWrites.length===1','SMTP save');
  const smtpWrite=await evaluate(client,'window.smtpTestWrites[0]');assert.equal(smtpWrite.path,'/api/smtp-settings');assert.equal(smtpWrite.body.daysBefore,undefined);assert.equal(smtpWrite.body.owners,undefined);assert.equal(smtpWrite.body.password,'');
  await evaluate(client,'document.querySelector("#globalSmtpPolicyReminder").click()');
  await waitFor(client,'!document.querySelector("#policySmtpDays").disabled','reminder reloaded');
  await evaluate(client,'document.querySelector("#policySmtpDays").value="14";document.querySelector("#policySmtpForm").requestSubmit()');
  await waitFor(client,'window.smtpTestWrites.length===2','reminder save');
  const reminderWrite=await evaluate(client,'window.smtpTestWrites[1]');assert.equal(reminderWrite.path,'/api/policy-register/reminder-settings');assert.equal(reminderWrite.body.daysBefore,14);assert.equal(reminderWrite.body.host,undefined);assert.equal(reminderWrite.body.password,undefined);
  await fs.mkdir('output/smtp-separation',{recursive:true});
  for(const width of [1440,390]){await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});for(const screen of ['reminder','smtp']){if(screen==='smtp')await evaluate(client,'document.querySelector("#policyOpenGlobalSmtp").click()');else await evaluate(client,'document.querySelector("#globalSmtpPolicyReminder").click()');await delay(350);assert.equal(await evaluate(client,'document.documentElement.scrollWidth>innerWidth+1'),false);const shot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile('output/smtp-separation/'+screen+'-'+width+'.png',Buffer.from(shot.data,'base64'));}}
  assert.deepEqual(errors,[]);console.log('PASS: SMTP and reminder navigation, independent save payloads, password preservation, and responsive UI; no email sent.');
 }finally{client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});
