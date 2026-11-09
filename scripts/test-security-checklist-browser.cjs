/** Real Vue component in Chrome with fixture transport; no installation data or login. */
require('dotenv').config = () => ({ parsed: {} });
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), http = require('node:http');
const path = require('node:path'), os = require('node:os'), { spawn } = require('node:child_process');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { Cdp } = require('./test-threat-modelling-browser');
const { defaults } = require('../src/services/securityChecklistService');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const source = await fs.readFile('frontend/client/src/workspace/components/SecurityChecklistView.vue', 'utf8');
  const { descriptor, errors } = parse(source);
  if (errors.length) throw errors[0];
  const component = compileScript(descriptor, { id: 'checklist-fixture', inlineTemplate: true }).content.replace(/from ['"]vue['"]/g, "from '/vue.js'").replace('export default', 'const Component =');
  const pickerSource = await fs.readFile('frontend/client/src/workspace/components/ChecklistSearchSelect.vue', 'utf8');
  const pickerDescriptor = parse(pickerSource).descriptor;
  const pickerScript = compileScript(pickerDescriptor, { id: 'picker-fixture', inlineTemplate: true }).content.replace(/from ['"]vue['"]/g, "from '/vue.js'");
  const setup = `window.fixtureRole='maker';window.requests=[];window.saved=[];window.failSave=false;
    const columns=${JSON.stringify(defaults)};
    window.fetch=async(url,options={})=>{
      const method=options.method||'GET', body=options.body?(options.body instanceof FormData ? JSON.parse(options.body.get('data')) : JSON.parse(options.body)):null;
      requests.push({url,method,body});
      const username=fixtureRole==='assessor'?'assessor':'maker';
      if(url==='/api/auth/me')return {ok:true,status:200,json:async()=>({username,role:'editor',actions:{'compliance-security-checklist':{read:true,create:true,update:true,delete:true}}})};
      if(url.endsWith('/users'))return {ok:true,status:200,json:async()=>[{username:'maker',fullName:'Maker'},{username:'assessor',fullName:'Assessor'}]};
      if(method==='GET')return {ok:true,status:200,json:async()=>({checklists:structuredClone(saved.filter(r=>r.kind==='template'||r.owner===username||r.assessor===username)),columns})};
      if(failSave)return {ok:false,status:409,json:async()=>({error:'Checklist telah berubah. Muat ulang sebelum menyimpan.'})};
      let record;
      if(method==='POST'&&url.endsWith('/assignments')){
        const template=saved.find(r=>r.id===body.templateId);
        const data=structuredClone(template.data);for(const r of data.rows)for(const c of data.columns)if(c.phase==='assessment')r.values[c.id]='';
        record={id:crypto.randomUUID(),kind:'assignment',owner:username,title:body.title,assessor:body.assessor,template_id:template.id,template_title:template.title,data,version:1,files:[]};
      }else if(method==='POST')record={id:crypto.randomUUID(),kind:'template',owner:username,title:body.title,assessor:username,data:{columns:body.columns,rows:body.rows},version:1,files:[]};
      else {
        const id=url.split('/')[4];record=structuredClone(saved.find(r=>r.id===id));record.version++;
        if(method==='PUT'){record.title=body.title;record.data={columns:body.columns,rows:body.rows};}
        else if(url.endsWith('/assignment-info')){record.title=body.title;record.assessor=body.assessor;}
        else for(const r of record.data.rows)Object.assign(r.values,body.rows.find(v=>v.id===r.id).values);
      }
      if(body.removeFiles)record.files=record.files.filter(f=>!body.removeFiles.includes(f.id));
      if(options.body instanceof FormData)options.body.getAll('files').forEach((f,i)=>record.files.push({id:crypto.randomUUID(),name:f.name,row_id:body.fileTargets[i].rowId,column_id:body.fileTargets[i].columnId,size:f.size}));
      saved=[record,...saved.filter(r=>r.id!==record.id)];return {ok:true,status:200,json:async()=>structuredClone(record)};
    };`;
  const i18nSource = await fs.readFile('frontend/public/i18n.js');
  const html = `<!doctype html><html><body><style>*{box-sizing:border-box}table{border-collapse:collapse}th,td{padding:8px;border:1px solid #ddd}${descriptor.styles.map(style=>style.content).join('\n')}${pickerDescriptor.styles.map(style=>style.content).join('\n')}</style><div id="app"></div><script src="/i18n.js"></script><script>localStorage.setItem('nist-basis-language','id');NistI18n.setLanguage('id');${setup}</script><script type="module" src="/fixture.js"></script></body></html>`;
  const vue = await fs.readFile('node_modules/vue/dist/vue.esm-browser.js');
  const workbookSource = (await fs.readFile('frontend/client/src/services/securityChecklistWorkbook.mjs', 'utf8')).replace("from 'xlsx'", "from '/xlsx.mjs'");
  const xlsxSource = await fs.readFile('node_modules/xlsx/xlsx.mjs');
  const workbookClient = await fs.readFile('frontend/client/src/services/securityChecklistWorkbookClient.mjs');
  const archiveSource = await fs.readFile('frontend/client/src/services/securityChecklistArchive.mjs');
  const workerSource = await fs.readFile('frontend/client/src/services/securityChecklistWorkbook.worker.mjs');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url.endsWith('.js') || req.url.endsWith('.mjs') || req.url.endsWith('.vue') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    res.end(req.url.endsWith('/securityChecklistWorkbookClient.mjs') ? workbookClient : req.url.endsWith('/securityChecklistArchive.mjs') ? archiveSource : req.url.endsWith('/securityChecklistWorkbook.worker.mjs') ? workerSource : req.url.endsWith('/ChecklistSearchSelect.vue') ? pickerScript : req.url === '/i18n.js' ? i18nSource : req.url.endsWith('/securityChecklistWorkbook.mjs') ? workbookSource : req.url === '/xlsx.mjs' ? xlsxSource : req.url === '/vue.js' ? vue : req.url === '/fixture.js' ? component + "\nimport {createApp} from '/vue.js';createApp(Component).mount('#app');window.dispatchEvent(new Event('security-checklist-open'));" : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-checklist-browser-'));
  let chrome, cdp;
  try {
    chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let port;
    for (let i = 0; i < 100; i++) { try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
    assert.ok(port, 'Chrome debug endpoint must become available');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.connect(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
    await cdp.wait("document.querySelector('.checklist-kpis')");
    assert.equal(await cdp.evaluate("document.querySelectorAll('[role=tab]').length"), 3);
    await cdp.evaluate("document.getElementById('checklistCreateTab').click()");
    await cdp.wait("document.querySelector('#checklistCreatePanel .button-accent')");
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-list td[colspan]').colSpan"),4);
    assert.ok(await cdp.evaluate("Math.abs(document.querySelector('.checklist-list table').getBoundingClientRect().width-document.querySelector('.checklist-list').clientWidth)<3"),'Template table fills container');
    await cdp.evaluate("document.querySelector('#checklistCreatePanel .button-accent').click()");
    await cdp.wait("document.querySelector('.checklist-dialog:modal .checklist-editor')");
    // LAN HTTP may not provide randomUUID; row creation uses getRandomValues.
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-grid tbody tr').length"), 1);
    await cdp.evaluate(`const editor=document.querySelector('.checklist-editor');const set=(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};set(editor.querySelector('input:not([type=file])'),'Access review');set(editor.querySelectorAll('.checklist-grid textarea')[1],'Tidak sesuai');Array.from(editor.querySelectorAll('button')).find(b=>b.textContent==='Kustomisasi kolom').click();`);
    await cdp.wait("document.querySelector('.checklist-columns')");
    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Tambah kolom').click()");
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-column').length"), 8);
    await cdp.evaluate("window.confirm=()=>false;document.querySelector('[aria-label=\"Tutup modal checklist\"]').click()");
    assert.equal(await cdp.evaluate("Boolean(document.querySelector('.checklist-dialog:modal'))"), true, 'Cancel discard retains modal and draft');
    await cdp.evaluate("window.confirm=()=>true");
    await cdp.evaluate("document.querySelector('.checklist-editor').requestSubmit()");
    await cdp.wait("window.saved.length===1");
    assert.equal(await cdp.evaluate('saved[0].kind'), 'template');
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-editor [name=assessor]').length"), 0, 'template creation has no assessor field');
    assert.equal(await cdp.evaluate('saved[0].data.columns.length'), 8);
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Ekspor Excel').click()");
    const exported = path.join(profile, 'compliance-security-checklist.xlsx');
    let downloaded;
    for (let i = 0; i < 100; i++) { try { downloaded = await fs.readFile(exported); break; } catch { await delay(100); } }
    assert.ok(downloaded, 'Export button must download an Excel file');
    const { readChecklistWorkbook } = await import('../frontend/client/src/services/securityChecklistWorkbook.mjs');
    assert.equal(readChecklistWorkbook(downloaded, defaults).columns.length, 8);
    await cdp.wait("document.querySelector('input[type=file]') && !document.querySelector('input[type=file]').disabled");
    const dom = await cdp.send('DOM.getDocument');
    const node = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: 'input[type=file]' });
    await cdp.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [exported] });
    await cdp.wait("document.querySelector('.checklist-editor [aria-live]').textContent.includes('baris diimpor sebagai draft')");
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-editor').textContent.includes('belum disimpan')"), true);
    await cdp.evaluate("document.querySelector('.checklist-editor').requestSubmit()");
    await cdp.wait("saved[0].version===2");
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-evidence input[type=file]').length"), 0, 'template does not accept assessment evidence');
    await cdp.evaluate("document.querySelector('[aria-label=\"Tutup modal checklist\"]').click()");
    await cdp.wait("!document.querySelector('.checklist-dialog')");
    await cdp.evaluate("document.getElementById('checklistAssignmentTab').click()");
    await cdp.wait("document.getElementById('checklistNewAssignment')");
    for (const [title, assessorName] of [['Aplikasi 1','assessor'],['Aplikasi 2','maker']]) {
      await cdp.evaluate("document.getElementById('checklistNewAssignment').click()");
      await cdp.wait("document.querySelector('.checklist-assignment-dialog:modal')");
      assert.ok(await cdp.evaluate("parseFloat(getComputedStyle(document.querySelector('.checklist-assignment-dialog form')).paddingTop)>=20"),'Modal has inner spacing');
      assert.equal(await cdp.evaluate("getComputedStyle(document.querySelector('.checklist-assignment-dialog fieldset')).display"),'grid');
      for(const [id,query] of [['checklistAssignmentTemplate','Access'],['checklistAssignmentAssessor',assessorName]]){
        await cdp.evaluate(`{const input=document.getElementById(${JSON.stringify(id)});input.focus();input.value='zz-no-match';input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await cdp.wait("document.querySelector('.checklist-search-empty')");
        await cdp.evaluate(`{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input',{bubbles:true}));}`);
        await cdp.wait(`document.querySelectorAll('#${id}-options [role=option]').length===1`);
        await cdp.evaluate(`document.getElementById(${JSON.stringify(id)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
        await cdp.wait(`document.getElementById(${JSON.stringify(id)}).getAttribute('aria-expanded')==='false'`);
      }
      await cdp.evaluate(`{const f=document.querySelector('.checklist-assignment-dialog form');f.elements.title.value=${JSON.stringify(title)};f.elements.title.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();}`);
      await cdp.wait("!document.querySelector('.checklist-assignment-dialog')");
    }
    assert.equal(await cdp.evaluate("saved.filter(r=>r.kind==='assignment').length"),2);
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-list thead tr').cells.length"),6);
    for(const width of [1280,390]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      assert.ok(await cdp.evaluate("Math.abs(document.querySelector('.checklist-list table').getBoundingClientRect().width-document.querySelector('.checklist-list').clientWidth)<3"),'Assignment table fills container at '+width);
      assert.ok(await cdp.evaluate("document.documentElement.scrollWidth<=innerWidth"),'No page overflow at '+width);
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.evaluate("window.fixtureRole='assessor';window.dispatchEvent(new Event('security-checklist-open'))");
    await cdp.wait("document.querySelectorAll('[data-checklist-open]').length===1");
    await cdp.evaluate("document.querySelector('[data-checklist-open]').click()");
    await cdp.wait("document.querySelector('.checklist-dialog:modal .checklist-editor')");
    assert.equal(await cdp.evaluate("document.getElementById('checklistEditorTitle').textContent"),'Aplikasi 1');
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-grid textarea').readOnly"),true);
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-column').length"),0);
    const evidencePath=path.join(profile,'fixture-evidence.pdf');await fs.writeFile(evidencePath,'%PDF-1.7\nFixture');
    const evidenceDom=await cdp.send('DOM.getDocument');const evidenceNode=await cdp.send('DOM.querySelector',{nodeId:evidenceDom.root.nodeId,selector:'.checklist-evidence input[type=file]'});
    await cdp.send('DOM.setFileInputFiles',{nodeId:evidenceNode.nodeId,files:[evidencePath]});
    await cdp.wait("document.querySelector('.checklist-evidence').textContent.includes('Belum diunggah')");
    await cdp.evaluate("const status=document.querySelector('.checklist-grid select');status.value='Sesuai';status.dispatchEvent(new Event('change',{bubbles:true}));");
    await cdp.evaluate("document.querySelector('.checklist-editor').requestSubmit()");
    await cdp.wait("saved.find(r=>r.title==='Aplikasi 1').version===2");
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-evidence a').textContent"),'fixture-evidence.pdf');
    assert.equal(await cdp.evaluate("saved.find(r=>r.title==='Aplikasi 2').data.rows[0].values.status"),'');
    assert.equal(await cdp.evaluate("saved.find(r=>r.kind==='template').data.rows[0].values.status"),'');
    const patch=await cdp.evaluate("requests.find(r=>r.method==='PATCH'&&r.url.endsWith('/assessment')).body");
    assert.deepEqual(Object.keys(patch.rows[0].values),['status','evidence','pic']);
    await cdp.evaluate("NistI18n.setLanguage('en')");
    await cdp.wait("document.querySelector('#checklistCreateTab').textContent.includes('Create Checklist')");
    assert.equal(await cdp.evaluate("document.getElementById('checklistEditorTitle').textContent"),'Aplikasi 1');
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-evidence a').textContent"),'fixture-evidence.pdf');
    assert.ok((await cdp.evaluate("document.querySelector('.checklist-editor').textContent")).includes('Upload evidence'));
    assert.equal(await cdp.evaluate("document.querySelector('.checklist-grid select').value"), 'Sesuai');
    assert.notEqual(await cdp.evaluate("document.querySelector('.checklist-grid select').selectedOptions[0].textContent"), 'Sesuai');
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-grid textarea')[1].value"),'Tidak sesuai');
    await cdp.evaluate("window.failSave=true;const field=document.querySelectorAll('.checklist-grid textarea')[4];field.value='Evidence';field.dispatchEvent(new Event('input',{bubbles:true}));");
    await cdp.evaluate("document.querySelector('.checklist-editor').requestSubmit()");
    await cdp.wait("document.querySelector('.checklist-dialog [role=alert]')?.textContent.includes('The checklist has changed')");
    assert.equal(await cdp.evaluate("document.querySelectorAll('.checklist-grid textarea')[4].value"),'Evidence');
    assert.deepEqual(cdp.errors, []);
    console.log('PASS: modal create/edit, discard cancellation, bilingual UI, evidence uploads, reusable templates, two application assignments with isolated results, Excel download/import, custom columns, restricted assessment payload and conflict retention in Chrome (fixture API).');
  } finally {
    cdp?.socket.close(); chrome?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await delay(500);
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('nist-checklist-browser-')) await fs.rm(resolved, { recursive: true, force: true }).catch(() => {});
  }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
