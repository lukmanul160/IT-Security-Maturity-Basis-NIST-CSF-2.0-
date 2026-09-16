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


(async () => {
 const chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'], {stdio:'ignore',windowsHide:true});
 let client;
 try {
  await waitForChrome();
  const target = await (await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(require('node:url').pathToFileURL(path.resolve('frontend/public/landing.html')).href), {method:'PUT'})).json();
  client = new CdpClient(target.webSocketDebuggerUrl); await client.connect();
  await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Page.bringToFront');
  await waitFor(client, 'document.querySelector(".concept-model")', 'concept model');
  await waitFor(client, 'document.querySelector(".concept-node").getAttribute("aria-pressed") === "true"', 'model initialization');
  for (const key of ['strategy','organization','process','performance']) {
    const active = await evaluate(client, `(() => { document.querySelector('[data-concept="${key}"]').click(); return document.querySelector('[data-concept="${key}"]').getAttribute('aria-pressed') === 'true' && document.querySelector('.concept-stage').classList.contains('is-paused'); })()`);
    assert.equal(active,true,key);
  }
  assert.equal(await evaluate(client, `(() => { const model=document.querySelector('.concept-model'); const before=model.style.getPropertyValue('--model-y'); document.querySelector('[data-model-rotate="1"]').click(); return model.style.getPropertyValue('--model-y')!==before; })()`),true);
  await evaluate(client, 'document.querySelector("[data-model-reset]").click()');
  await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await delay(100);
  assert.equal(await evaluate(client,'document.querySelector("[data-model-play]").disabled && document.querySelector(".concept-stage").classList.contains("is-paused")'),true);
  await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  
  await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(client,'document.querySelector("[data-model-reset]").click(); document.activeElement.blur()');
  await delay(4100);
  assert.equal(await evaluate(client,'document.querySelector("[data-concept=organization]").getAttribute("aria-pressed")'), 'true');
  await evaluate(client,'document.querySelector("[data-concept=process]").focus()');
  console.log(await evaluate(client,'({active:document.activeElement.outerHTML.slice(0,450),tag:document.querySelector("[data-concept=process]").tagName})')); await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await client.send('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate(client,'document.querySelector("[data-concept=process]").getAttribute("aria-pressed")'), 'true');
  const point = await evaluate(client,'(() => {const r=document.querySelector(".concept-scene").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,before:document.querySelector(".concept-model").style.getPropertyValue("--model-y")}})()');
  await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+10,button:'left',buttons:1});
  await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+10,button:'left',clickCount:1});
  assert.notEqual(await evaluate(client,'document.querySelector(".concept-model").style.getPropertyValue("--model-y")'),point.before);
  await evaluate(client,'document.querySelector("[data-model-reset]").click()');
  console.log('PASS: automatic tour, keyboard activation, pointer drag, selection, pause, rotation, reset and reduced motion');
  await fs.mkdir('output/workspace-model', {recursive:true});
  for (const width of [1440,390]) {
   await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await delay(300);
   const result = await evaluate(client, '({nodes:document.querySelectorAll(".concept-node").length, arrows:document.querySelectorAll(".concept-connections > path").length, overflow:document.documentElement.scrollWidth>innerWidth, labels:[...document.querySelectorAll(".concept-node strong")].map(x=>x.textContent)})');
   assert.equal(result.nodes,4); assert.equal(result.arrows,4); if(result.overflow) console.log(await evaluate(client, `([...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,20))`));
   const shot = await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await fs.writeFile('output/workspace-model/preview-'+width+'.png',Buffer.from(shot.data,'base64'));
   console.log(JSON.stringify({width,...result}));
  }
 } finally {client?.close();chrome.kill(); await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});