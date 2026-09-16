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
  const origin=baseUrl;
  const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});
  let client;const errors=[];
  try {
    const html=await(await fetch(origin+'/')).text();assert.equal((html.match(/data:image\/webp;base64,/g)||[]).length,12);
    assert.equal((await fetch(origin+'/api/risk-management')).status,401);
    const protectedRoute=await fetch(origin+'/app',{redirect:'manual'});assert.equal(protectedRoute.status,302);assert.equal(protectedRoute.headers.get('location'),'/login');
    await waitForChrome();
    const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();
    client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Page.enable');await client.send('Runtime.enable');
    client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text));
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await waitFor(client,'document.querySelectorAll(".catalog-item").length===17','catalog');
    const loaded=await evaluate(client,`(async()=>{const images=[...document.querySelectorAll('.gallery-image img')];images.forEach(img=>img.loading='eager');await Promise.all(images.map(img=>img.decode()));return images.length})()`);assert.equal(loaded,12);
    assert.equal(await evaluate(client,`(()=>{const x=document.querySelector('#catalog-search');x.value='SMTP';x.dispatchEvent(new Event('input'));return document.querySelectorAll('.catalog-item:not([hidden])').length})()`),1);
    assert.equal(await evaluate(client,`(()=>{const x=document.querySelector('#catalog-search');x.value='not-found-unique';x.dispatchEvent(new Event('input'));return !document.querySelector('#catalog-empty').hidden})()`),true);
    await evaluate(client,`const search=document.querySelector('#catalog-search');search.value='';search.dispatchEvent(new Event('input'));document.querySelector('[data-catalog-filter="risk"]').click();`);
    assert.equal(await evaluate(client,'document.querySelectorAll(".catalog-item:not([hidden])").length'),5);
    await evaluate(client,'document.querySelector("[data-catalog-filter=all]").click();document.querySelector("[data-gallery-filter=assessment]").click()');
    assert.equal(await evaluate(client,'document.querySelectorAll(".gallery-card:not([hidden])").length'),4);
    await evaluate(client,'document.querySelector(".gallery-open").click()');
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-dialog").open'),true);
    await evaluate(client,'document.querySelector("#screenshot-image").decode()');
    await evaluate(client,'document.querySelector("#screenshot-next").click()');
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-title").textContent'),'NIST Privacy');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-title").textContent'),'Dashboard NIST CSF');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor(client,'!document.querySelector("#screenshot-dialog").open&&!document.body.classList.contains("screenshot-open")','dialog close');
    assert.equal(await evaluate(client,'!document.querySelector("#screenshot-dialog").open&&!document.body.classList.contains("screenshot-open")'),true);
    const ids=await evaluate(client,`(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()`);assert.deepEqual(ids,[]);
    for(const width of [1440,768,390]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      for(const section of ['fitur-lengkap','galeri']){
        await evaluate(client,`document.getElementById('${section}').scrollIntoView({behavior:'instant',block:'start'})`);await delay(250);
        assert.equal(await evaluate(client,'document.documentElement.scrollWidth>innerWidth+1'),false,'overflow '+width);
        const image=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('output/landing-preview/'+section+'-'+width+'.png',Buffer.from(image.data,'base64'));
      }
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,catalog:17,screenshots:12,search:true,filters:true,lightbox:true,keyboard:true,embeddedPreviews:true,protectedApp:true,viewports:[1440,768,390]}));
  } finally {client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});
