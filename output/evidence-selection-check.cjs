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
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const original=window.fetch;window.evidenceWrites=[];window.fetch=async(input,options)=>{const url=String(input);if(url==='/api/files?details=true')return new Response(JSON.stringify(Array.from({length:25},(_,i)=>({name:'Owned-'+String(i).padStart(2,'0')+'.pdf',path:'upload/Govern/Policy/test/'+i+'.pdf',source:'Uploaded files'}))),{headers:{'Content-Type':'application/json'}});if(['/api/assessment','/api/privacy/assessment'].includes(url)&&options?.method==='PUT'){const data=JSON.parse(options.body);window.evidenceWrites.push({url,data});return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}window.pendingEvidenceRequests=(window.pendingEvidenceRequests||0)+1;try{return await original(input,options);}finally{window.pendingEvidenceRequests--;window.lastEvidenceResponse=Date.now();}};})();`});
  await waitFor(client,`document.querySelector('#loginForm')`,'login');await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);
  await waitFor(client,`document.documentElement.dataset.frontend==='vue' && document.querySelector('[data-view="csf"]')`,'workspace');await waitFor(client,`window.pendingEvidenceRequests===0 && Date.now()-window.lastEvidenceResponse>1000`,'initial data settled',60000);
  for(const [view,mode] of [['csf','core'],['csf','assessment'],['privacy','core'],['privacy','assessment']]){
   const privacy=view==='privacy';const toggle=privacy?'data-toggle-privacy-existing':'data-toggle-existing';const picker=privacy?'data-privacy-existing-picker':'data-existing-picker';const option=privacy?'data-use-privacy-existing':'data-use-existing';const search=privacy?'data-privacy-existing-search':'data-existing-search';const page=privacy?'data-privacy-existing-page':'data-existing-page';
   await evaluate(client,`document.querySelector('[data-view="${view}"]').click();document.querySelector('[data-${view}-tab="core"]').click()`);
   if(mode==='assessment')await evaluate(client,`document.querySelector('#${privacy?'privacyAssessmentButton':'csfAssessmentButton'}').click()`);
   await waitFor(client,`Array.from(document.querySelectorAll('[${toggle}]')).some(b=>b.getClientRects().length)`,'visible button');
   await evaluate(client,`window.clickedButton=Array.from(document.querySelectorAll('[${toggle}]')).find(b=>b.getClientRects().length);window.clickedPicker=clickedButton.closest('.attachment-control').querySelector('[${picker}]');window.selectedKey=clickedButton.getAttribute('${toggle}');clickedButton.click()`);
   try { await waitFor(client,`clickedPicker.classList.contains('visible') && clickedPicker.getClientRects().length && clickedPicker.querySelectorAll('[${option}]').length===20`,view+' '+mode+' popup visible'); }
   catch(error) { console.log(await evaluate(client,`({connected:clickedPicker.isConnected,classes:clickedPicker.className,rects:clickedPicker.getClientRects().length,options:clickedPicker.querySelectorAll('[${option}]').length,active:document.querySelector('.view.active-view')?.id,status:document.querySelector('#saveState').textContent})`)); throw error; }
   await evaluate(client,`clickedPicker.querySelector('[${page}][data-page="2"]').click()`);
   assert.equal(await evaluate(client,`clickedPicker.querySelectorAll('[${option}]').length`),5,view+' pagination');
   const selectedName=mode==='core'?'Owned-24':'Owned-23';
   await evaluate(client,`var input=clickedPicker.querySelector('[${search}]');input.focus();window.focusBefore={disabled:input.disabled,active:document.activeElement===input,html:input.outerHTML};input.value='${selectedName}';input.dispatchEvent(new Event('input',{bubbles:true}))`);
   assert.equal(await evaluate(client,`clickedPicker.querySelectorAll('[${option}]').length`),1,view+' search');
   assert.equal(await evaluate(client,`document.activeElement===clickedPicker.querySelector('[${search}]')`),true,view+' '+mode+' search retains focus '+JSON.stringify(await evaluate(client,`({before:window.focusBefore,active:document.activeElement.tagName,connected:clickedPicker.isConnected,display:getComputedStyle(clickedPicker).display,visible:clickedPicker.getClientRects().length})`)));
   const before=await evaluate(client,`window.evidenceWrites.length`);
   await evaluate(client,`clickedPicker.querySelector('[${option}]').click()`);
   await waitFor(client,`window.evidenceWrites.length>${before} && document.querySelector('#saveState').textContent==='Evidence tersimpan.'`,'save request');
   const saved=await evaluate(client,`window.evidenceWrites.at(-1)`);assert.equal(saved.url,privacy?'/api/privacy/assessment':'/api/assessment');assert.ok(saved.data.attachments[await evaluate(client,'window.selectedKey')].some(f=>f.name===selectedName+'.pdf'));
  }
  console.log('PASS: CSF and Privacy core + assessment: visible popup, pagination, search, select and save payload. No real records changed.');
 }finally{client?.close();chrome.kill();await delay(1000);await removeBrowserProfile();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
