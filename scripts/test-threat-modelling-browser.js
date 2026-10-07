// Exercises the real UI/API against an isolated threat-model table.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pool } = require('../src/config/database');
const { createSession } = require('../src/config/auth');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.pending = new Map(); this.id = 0; this.errors = []; }
  async connect() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve); this.socket.addEventListener('error', reject); });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const handler = this.pending.get(message.id); this.pending.delete(message.id); if (handler) message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result); }
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000); this.pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const output = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (output.exceptionDetails) throw new Error(output.exceptionDetails.exception?.description || output.exceptionDetails.text); return output.result.value; }
  async wait(expression) { for (let i = 0; i < 150; i++) { if (await this.evaluate(`Boolean(${expression})`)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
}
async function run() {
  const schema = `threat_test_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query.bind(pool);
  let server, chrome, client;
  const profile = path.join(os.tmpdir(), `nist-threat-browser-${process.pid}-${Date.now()}`);
  try {
    await originalQuery(`CREATE SCHEMA "${schema}"`);
    let failFirstRead = true;
    pool.query = async (sql, ...args) => {
      if (failFirstRead && /^SELECT/.test(sql) && /\bthreat_models\b/.test(sql)) { failFirstRead = false; throw Object.assign(new Error('Temporary diagram load failure'), { status: 503 }); }
      return originalQuery(sql.replace(/\bthreat_models\b/g, `"${schema}".threat_models`), ...args);
    };
    await require('../src/services/threatModelService').ensureStore();
    const admin = (await originalQuery("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
    assert.ok(admin, 'Existing admin needed for profile read');
    const token = createSession({ username: admin.username, role: 'admin' });
    server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const debugPort = 9600 + Math.floor(Math.random() * 100);
    chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let target;
    for (let i = 0; i < 100; i++) { try { const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }); target = await response.json(); break; } catch { await delay(100); } }
    assert.ok(target, 'Chrome started'); client = new Cdp(target.webSocketDebuggerUrl); await client.connect();
    await client.send('Runtime.enable'); await client.send('Page.enable');
    // HTTP deployments do not expose randomUUID; exercise the ID fallback.
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });' });
    await client.send('Network.setCookie', { name: 'nist_session', value: token, url: base, httpOnly: true });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1050, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: `${base}/app` });
    await client.wait('document.documentElement.dataset.frontend === "vue"');
    console.log('Browser check: workspace mounted');
    await client.wait('document.querySelector(".tm-load-error")');
    await client.evaluate('document.querySelector(".tm-load-error button").click()');
    await client.wait('!document.querySelector(".tm-load-error") && !document.querySelector(".tm-palette>button").disabled');
    await client.evaluate('document.querySelector("[data-view=threat-modelling]").click()');
    await client.wait('!document.querySelector(".tm-palette-help button").disabled');
    await client.evaluate('document.querySelector(".tm-palette>button").click()');
    await client.wait('document.querySelectorAll("[data-tm-node]").length===1');
    assert.equal(await client.evaluate('document.querySelector("[data-tm-node]").getAttribute("transform").includes("NaN")'), false);
    await client.evaluate(`(()=>{
      const viewport = document.querySelector('.tm-viewport');
      const rect = viewport.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', 'process');
      viewport.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: rect.x + 100, clientY: rect.y + 100 }));
    })()`);
    await client.wait('document.querySelectorAll("[data-tm-node]").length===2');
    assert.equal(await client.evaluate(`(()=>{
      const node = document.querySelectorAll('[data-tm-node]')[1].getBoundingClientRect();
      const viewport = document.querySelector('.tm-viewport').getBoundingClientRect();
      return node.width > 0 && node.height > 0 && node.right > viewport.left && node.left < viewport.right && node.bottom > viewport.top && node.top < viewport.bottom;
    })()`), true, 'Dropped shape is visible in the canvas');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Undo")).click()');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Undo")).click()');
    console.log('Browser check: palette click and drop render without randomUUID');
    assert.equal(await client.evaluate('document.querySelectorAll("[data-tm-stencil]").length'), 59);
    await client.evaluate(`document.querySelector('[data-tm-stencil="SE.DS.TMCore.SQL"]').click()`);
    await client.wait('document.querySelectorAll("[data-tm-node]").length===1');
    assert.equal(await client.evaluate('document.querySelector("[name=element-stencil]").value'), 'SQL Database');
    assert.ok(await client.evaluate('document.querySelectorAll(".tm-element-properties select").length > 1'));
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Undo")).click()');
    await client.evaluate('window.confirm = () => true');
    await client.evaluate('document.querySelector(".tm-palette-help button").click()');
    await client.wait('document.querySelectorAll("[data-tm-node]").length===4');
    console.log('Browser check: example diagram rendered');
    const initialView = await client.evaluate('document.querySelector(".tm-canvas").getAttribute("viewBox")');
    await client.evaluate('document.querySelector(".tm-viewport").dispatchEvent(new WheelEvent("wheel", {deltaX:-20000,deltaY:30000,bubbles:true,cancelable:true}))');
    assert.notEqual(await client.evaluate('document.querySelector(".tm-canvas").getAttribute("viewBox")'), initialView, 'Canvas pans beyond its former bounds');
    await client.evaluate('document.querySelector("[name=canvas-fit]").click()');
    // Use real input events so browser fullscreen receives a user gesture.
    const fullPoint = await client.evaluate(`(()=>{const r=document.querySelector('[name="toggle-fullscreen"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...fullPoint, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...fullPoint, button: 'left', clickCount: 1 });
    await client.wait('document.querySelector("#threatModellingView").classList.contains("tm-fullscreen")');
    await client.evaluate('document.querySelector("[name=toggle-fullscreen]").click()');
    await client.wait('!document.querySelector("#threatModellingView").classList.contains("tm-fullscreen")');
    await client.evaluate(`document.querySelector('[data-tm-stencil="SE.DF.TMCore.HTTPS"]').click()`);
    assert.equal(await client.evaluate('document.querySelectorAll("[data-tm-edge]").length'), 2);
    const clickNode = async index => {
      const point = await client.evaluate(`(()=>{const r=document.querySelectorAll('[data-tm-node]')[${index}].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      return point;
    };
    // Connecting and deleting flows updates the graph, and both operations undo.
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Connect")).click()');
    await clickNode(1);
    console.log('Browser check: source clicked');
    await client.wait('document.querySelector(".tm-status").textContent.includes("Pilih komponen tujuan")');
    await clickNode(3); await client.wait('document.querySelectorAll("[data-tm-edge]").length===3');
    console.log('Browser check: flow connected');
    assert.equal(await client.evaluate('document.querySelector("[name=element-stencil]").value'), 'HTTPS');
    assert.ok(await client.evaluate('document.querySelectorAll(".tm-element-properties select").length > 1'));
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>["Delete selection", "Hapus pilihan"].includes(b.textContent)).click()');
    await client.wait('document.querySelectorAll("[data-tm-edge]").length===2');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Undo")).click()');
    await client.wait('document.querySelectorAll("[data-tm-edge]").length===3');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Redo")).click()');
    await client.wait('document.querySelectorAll("[data-tm-edge]").length===2');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Select")).click()');
    // Dragging changes position on the grid; resize preserves bounded geometry.
    const dragPoint = await clickNode(2);
    const oldX = await client.evaluate('Number(Array.from(document.querySelectorAll(".tm-dimensions label")).find(e=>e.textContent.startsWith("x")).querySelector("input").value)');
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...dragPoint, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragPoint.x + 40, y: dragPoint.y + 20, button: 'left', buttons: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragPoint.x + 40, y: dragPoint.y + 20, button: 'left', clickCount: 1 });
    const newX = await client.evaluate('Number(Array.from(document.querySelectorAll(".tm-dimensions label")).find(e=>e.textContent.startsWith("x")).querySelector("input").value)');
    assert.ok(newX > oldX); assert.equal(newX % 20, 0);
    // Edit a component and attach a STRIDE threat.
    const bounds = await client.evaluate('(()=>{const r=document.querySelectorAll("[data-tm-node]")[2].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...bounds, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...bounds, button: 'left', clickCount: 1 });
    await client.wait('document.querySelector(".tm-threat-heading")');
    await client.evaluate('document.querySelector(".tm-threat-heading button").click()');
    await client.wait('document.querySelector(".tm-threat-card")');
    await client.evaluate('(()=>{const input=document.querySelector(".tm-threat-card input");input.value="Unauthorized API access";input.dispatchEvent(new Event("change",{bubbles:true}));})()');
    // Undo and redo must retain the editable graph.
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Undo")).click()');
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...bounds, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...bounds, button: 'left', clickCount: 1 });
    await client.wait('document.querySelector(".tm-threat-card input")?.value==="New threat"');
    await client.evaluate('Array.from(document.querySelectorAll(".tm-tools button")).find(b=>b.textContent.includes("Redo")).click()');
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...bounds, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...bounds, button: 'left', clickCount: 1 });
    await client.wait('document.querySelector(".tm-threat-card input")?.value==="Unauthorized API access"');
    await client.evaluate(`(()=>{
      const input = document.querySelector('[name="element-property-implementsAuthenticationScheme"]');
      input.value = 'Yes'; input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await client.evaluate('document.querySelector(".tm-save").click()');
    await client.wait('document.querySelector(".tm-status").textContent.includes("tersimpan di database")');
    const saved = await client.evaluate('fetch("/api/threat-modelling").then(r=>r.json())');
    assert.equal(saved.length, 1); assert.equal(saved[0].diagram.nodes.length, 4);

    assert.equal(saved[0].diagram.nodes.flatMap(node => node.threats)[0].title, 'Unauthorized API access');
    const configured = saved[0].diagram.nodes.find(node => node.properties?.implementsAuthenticationScheme === 'Yes');
    assert.ok(configured, 'Edited element properties are saved');
    assert.equal(configured.stencilId, 'SE.P.TMCore.WebSvc');
    // Stale versions are rejected by the real route.
    const stale = await fetch(`${base}/api/threat-modelling/${saved[0].id}`, { method: 'PUT', headers: { Cookie: `nist_session=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...saved[0], version: 99 }) });
    assert.equal(stale.status, 409);
    // Reload restores both navigation and the saved graph.
    await client.send('Page.reload'); await client.wait('document.documentElement.dataset.frontend === "vue" && document.querySelector("#threatModellingView").classList.contains("active-view")');
    await client.wait('document.querySelectorAll("[data-tm-node]").length===4');
    assert.equal(await client.evaluate('document.querySelector(".tm-canvas").getAttribute("width")'), '100%');
    await fs.mkdir('output/threat-modelling', { recursive: true });
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('output/threat-modelling/preview.png', Buffer.from(screenshot.data, 'base64'));
    // Read-only or unassigned roles cannot mutate the module.
    const viewerToken = createSession({ username: admin.username, role: 'viewer' });
    const denied = await fetch(`${base}/api/threat-modelling`, { method: 'POST', headers: { Cookie: `nist_session=${viewerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(saved[0]) });
    assert.equal(denied.status, 403);
    assert.deepEqual(client.errors, []);
    console.log(JSON.stringify({ status: 'passed', retryRecovery: true, nodes: 4, flows: 2, threats: 1, connectDelete: true, dragSnap: true, saveReload: true, undoRedo: true, conflictCheck: true, writePermission: true, screenshot: 'output/threat-modelling/preview.png' }));
  } catch (error) {
    if (client) {
      const diagnostic = await client.evaluate('({status:document.querySelector(".tm-status")?.textContent, mode:document.querySelector(".tm-tools .active")?.textContent, nodes:Array.from(document.querySelectorAll("[data-tm-node]")).map(e=>({label:e.querySelector("text")?.textContent,rect:JSON.stringify(e.getBoundingClientRect().toJSON())}))})').catch(() => null);
      console.log('Diagram interaction diagnostics:', JSON.stringify(diagnostic));
      const capture = await client.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
      if (capture) await fs.writeFile('output/threat-modelling/failure.png', Buffer.from(capture.data, 'base64'));
    }
    throw error;
  } finally {
    client?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    pool.query = originalQuery; await originalQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end();
    // The generated profile is confined to the OS temp directory.
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('nist-threat-browser-')) {
      await delay(1000); await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  }
}
module.exports = { Cdp };
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
