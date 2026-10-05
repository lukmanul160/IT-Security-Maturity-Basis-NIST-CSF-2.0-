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
    client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'Uncaught browser exception'));
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
    try {
    await waitFor(client, `location.pathname === '/app' && document.documentElement?.dataset.frontend === 'vue'`, 'Vue workspace', 25000);
    } catch (error) {
      const diagnostic = await evaluate(client, `({ path: location.pathname, title: document.title, text: document.body.innerText.slice(0, 500) })`);
      throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}; browser errors: ${JSON.stringify(errors)}`);
    }

    await waitFor(client, `document.querySelectorAll('.nav-item').length > 10`, 'workspace navigation');
    await delay(1500);

    if (process.env.BROWSER_TEST_FOCUS === 'sidebar-alignment') {
      const result = await evaluate(client, `(async()=>{
        const shell=document.querySelector('.app-shell'), saved=shell.className;
        const positions=()=>Array.from(document.querySelectorAll('.sidebar .nav-item')).filter(button=>button.getBoundingClientRect().width>0).map(button=>({
          icon:button.querySelector('.nav-icon').getBoundingClientRect().left-button.getBoundingClientRect().left,
          text:button.querySelector('span:not(.nav-icon)').getBoundingClientRect().left-button.getBoundingClientRect().left,
          view:button.dataset.view,alignment:getComputedStyle(button).justifyContent
        }));
        try {
          shell.classList.remove('sidebar-collapsed','sidebar-peek');await new Promise(r=>setTimeout(r,400));const expanded=positions();
          shell.classList.add('sidebar-collapsed');await new Promise(r=>setTimeout(r,400));
          document.querySelector('.sidebar').dispatchEvent(new MouseEvent('mouseenter'));await new Promise(r=>setTimeout(r,400));const hovered=positions();
          return {expanded,hovered,peek:shell.classList.contains('sidebar-peek')};
        } finally {shell.className=saved;}
      })()`);
      assert.equal(result.peek,true);
      for(const rows of [result.expanded,result.hovered]) {
        assert.ok(rows.length>=3);
        for(const row of rows){assert.equal(row.alignment,'flex-start');assert.ok(Math.abs(row.icon-rows[0].icon)<1);assert.ok(Math.abs(row.text-rows[0].text)<1);}
      }
      console.log('Sidebar expanded and hover alignment passed');return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'account-logout') {
      assert.deepEqual(errors, [], 'Workspace initializes without sidebar errors');
      const clickButton = async id => {
        const point = await evaluate(client, `(() => { const element=document.getElementById('${id}');const rect=element.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
        await client.send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1});
        await client.send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1});
      };
      await clickButton('accountButton');
      await waitFor(client, `document.querySelector('#accountView').classList.contains('active-view')`, 'Account button');
      await evaluate(client, `document.querySelector('[data-view="knowledge-notes"]').click()`);
      await waitFor(client, `document.querySelector('#knowledgeNotesView').classList.contains('active-view')`, 'Knowledge Notes navigation');
      await clickButton('accountButton');
      await waitFor(client, `document.querySelector('#accountView').classList.contains('active-view')`, 'Account from Knowledge Notes');
      await clickButton('logoutButton');
      await waitFor(client, `location.pathname === '/login' && document.querySelector('#loginForm')`, 'Logout redirects to login');
      assert.equal(await evaluate(client, `(async()=>{const response=await fetch('/api/auth/me');return response.status;})()`),401,'Logout clears session');
      assert.deepEqual(errors, [], 'Navigation and logout produce no browser errors');
      console.log('Passed: Account clicks, Account from Knowledge Notes, Logout redirect and session invalidation');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'user-entry') {
      await evaluate(client, `currentUserRole = 'user'; currentUserPermissions = permissionFallback.permissions.map(([key]) => key); applyUserAccess()`);
      for (const [view, tabSelector, buttonId, modalId] of [
        ['csf-manage', '', 'csfManageNewButton', 'csfManageModal'],
        ['privacy-manage', '', 'privacyManageNewButton', 'privacyManageModal'],
        ['risk-management', '', 'riskManagementNewButton', 'riskManagementModal'],
        ['risk-acceptance', '#riskAcceptanceListTab', 'riskAcceptanceNew', 'riskAcceptanceModal'],
        ['policy-register', '', 'policyRegisterNewButton', 'policyRegisterModal'],
        ['iso27001', '[data-iso-tab="clauses"]', 'iso27001NewButton', 'iso27001Modal'],
        ['questionnaire-templates', '', 'templateNewButton', 'templateModal'],
      ]) {
        await evaluate(client, `document.querySelector('[data-view="${view}"]').click()`);
        if (tabSelector) await evaluate(client, `document.querySelector(${JSON.stringify(tabSelector)}).click()`);
        const opened = await evaluate(client, `(() => { const button = document.getElementById('${buttonId}'); if (!button.checkVisibility() || button.disabled) return false; button.click(); const modal = document.getElementById('${modalId}'); return modal.open && modal.checkVisibility(); })()`);
        assert.equal(opened, true, `user input ${view}`);
        await evaluate(client, `document.getElementById('${modalId}').close()`);
      }
      await evaluate(client, `document.querySelector('[data-view="audit-finding-tracker"]').click(); document.querySelector('[data-aft-tab="manage"]').click()`);
      try { await waitFor(client, `!document.querySelector('#aftNew').disabled`, 'audit loaded for input'); }
      catch (error) { throw new Error(`${error.message}: ${JSON.stringify(await evaluate(client, `({status:document.querySelector('#aftStatus').textContent, navDisabled:document.querySelector('[data-view="audit-finding-tracker"]').disabled, active:document.querySelector('#auditFindingView').className})`))}; ${JSON.stringify(errors)}`); }
      assert.equal(await evaluate(client, `document.querySelector('#aftNew').checkVisibility()`), true);
      await evaluate(client, `document.querySelector('#aftNew').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftModal').open`), true);
      await evaluate(client, `document.querySelector('#aftModal').close()`);
      assert.equal(await evaluate(client, `document.querySelector('#organizationPersonnelNewButton').hidden && document.querySelector('[data-account-tab="storage"]').hidden && document.querySelector('#riskRegisterResetButton').hidden`), true);
      console.log('PASS: user input forms across operational modules; admin personnel, storage and reset controls remain restricted');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'csf-radar') {
      for (const [width, scale] of [[1440, 1], [768, 2], [390, 1]]) {
        await evaluate(client, `document.querySelector('[data-view="framework"]').click(); renderRadar()`);
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: scale, mobile: false });
        await evaluate(client, `document.querySelector('[data-view="csf"]').click()`);
        const correctSize = `(() => { const canvas = document.querySelector('#maturityRadar'); const rect = canvas.getBoundingClientRect(); return rect.width > 0 && rect.height === 430 && Math.abs(canvas.width - rect.width * devicePixelRatio) <= 1 && Math.abs(canvas.height - rect.height * devicePixelRatio) <= 1; })()`;
        await waitFor(client, correctSize, 'radar dimensions after navigation');
        await evaluate(client, `document.querySelector('[data-csf-tab="core"]').click(); renderRadar(); document.querySelector('[data-csf-tab="overview"]').click()`);
        await waitFor(client, correctSize, 'radar dimensions after tab switch');
        await evaluate(client, `document.querySelector('#csfView [data-series="policy"]').click()`);
        assert.equal(await evaluate(client, correctSize), true);
        assert.equal(await evaluate(client, `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`), false);
      }
      await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await evaluate(client, `document.querySelector('#maturityRadar').scrollIntoView({block:'center'})`);
      await delay(200);
      if (process.env.BROWSER_SCREENSHOT) {
        const capture = await client.send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(process.env.BROWSER_SCREENSHOT, Buffer.from(capture.data, 'base64'));
      }
      assert.deepEqual(errors, []);
      console.log('PASS: CSF radar dimensions after hidden render, navigation, tabs, legend toggles, responsive widths and HiDPI');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'submission-guard') {
      await evaluate(client, `(() => {
        window.submissionOriginalFetch = window.fetch;
        window.submissionCalls = 0;
        window.fetch = (url, options) => String(url) === '/api/auth/me' && options?.method === 'PUT'
          ? (window.submissionCalls++, new Promise(resolve => { window.finishSubmission = () => resolve(new Response('{}', {status: 200})); }))
          : window.submissionOriginalFetch(url, options);
        const form = document.querySelector('#accountProfileForm');
        form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
        form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      })()`);
      assert.equal(await evaluate(client, `window.submissionCalls`), 1);
      assert.equal(await evaluate(client, `document.querySelector('#accountProfileForm').getAttribute('aria-busy')`), 'true');
      await evaluate(client, `window.finishSubmission()`);
      await waitFor(client, `!document.querySelector('#accountProfileForm').hasAttribute('aria-busy')`, 'submission lock released');
      await evaluate(client, `document.querySelector('#accountProfileForm').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))`);
      assert.equal(await evaluate(client, `window.submissionCalls`), 2);
      await evaluate(client, `window.finishSubmission(); window.fetch = window.submissionOriginalFetch`);
      await waitFor(client, `!document.querySelector('#accountProfileForm').hasAttribute('aria-busy')`, 'second submission completed');
      assert.deepEqual(errors, []);
      console.log('PASS: repeated form submits send once while pending and allow subsequent saves');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'file-ownership') {
      await evaluate(client, `(() => {
        currentUserRole = 'user'; currentUserPermissions = ['files'];
        window.fileTestRows = [{ path: 'upload/Custom/Policy/owned.pdf', name: 'owned.pdf', type: 'application/pdf', openPage: 1 }];
        window.fileTestCalls = []; window.fileTestDenyDelete = true;
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
          if (typeof url !== 'string' || !url.startsWith('/api/files')) return originalFetch(url, options);
          window.fileTestCalls.push([url, options.method || 'GET']);
          if (options.method === 'DELETE') {
            if (window.fileTestDenyDelete) return new Response(JSON.stringify({ error: 'File masih digunakan.' }), { status: 409 });
            window.fileTestRows = []; return new Response(null, { status: 204 });
          }
          return new Response(JSON.stringify(options.method === 'PUT' ? window.fileTestRows[0] : window.fileTestRows), { status: 200 });
        };
        window.confirm = () => true;
        evidenceLibrary = window.fileTestRows;
        document.querySelector('[data-view="files"]').click();
      })()`);
      await waitFor(client, `document.querySelector('[data-uploaded-file-edit]')`, 'own file management');
      assert.equal(await evaluate(client, `canEditUploadedFile({path:'upload/Other/Policy/foreign.pdf'})`), false);
      assert.equal(await evaluate(client, `uploadedFileRecordMap.size`), 1, 'unlinked own upload is included');
      await evaluate(client, `document.querySelector('[data-uploaded-file-edit]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#uploadedFileEditModal').open`), true);
      await evaluate(client, `(() => {
        const transfer = new DataTransfer(); transfer.items.add(new File(['%PDF Test'], 'replacement.pdf', {type:'application/pdf'}));
        document.querySelector('#uploadedFileEditInput').files = transfer.files;
        document.querySelector('#uploadedFileEditForm').requestSubmit();
      })()`);
      await waitFor(client, `!document.querySelector('#uploadedFileEditModal').open`, 'owned file replacement');
      assert.equal(await evaluate(client, `window.fileTestCalls.some(([url,method]) => method === 'PUT' && url.includes('owned.pdf'))`), true);
      await evaluate(client, `document.querySelector('[data-delete-library-file]').click()`);
      await waitFor(client, `document.querySelector('#saveState').textContent === 'File masih digunakan.'`, 'delete error');
      assert.equal(await evaluate(client, `uploadedFileRecordMap.size`), 1, 'failed delete keeps file visible');
      await evaluate(client, `window.fileTestDenyDelete = false; document.querySelector('[data-delete-library-file]').click()`);
      await waitFor(client, `uploadedFileRecordMap.size === 0`, 'owned file deletion');
      assert.equal(await evaluate(client, `(async () => {
        const key = 'policy-' + allControls()[0].id;
        const other = { path: 'upload/Govern/Policy/other/same.pdf', name: 'same.pdf' };
        const own = { path: 'upload/Govern/Policy/own/same.pdf', name: 'same.pdf' };
        state.attachments[key] = [other];
        const previousFetch = window.fetch;
        let persisted;
        window.fetch = async (url, options = {}) => {
          if (url === '/api/assessment' && options.method === 'PUT') { persisted = JSON.parse(options.body); return new Response('{}'); }
          if (url === '/api/files/batch' || url === '/api/files?details=true') return new Response(JSON.stringify([own]));
          return previousFetch(url, options);
        };
        await uploadAttachment({ files: [new File(['%PDF own'], 'same.pdf', {type:'application/pdf'})], dataset: {attachment:key, function:'Govern', kind:'policy'} });
        return persisted.attachments[key].length === 2 && persisted.attachments[key][0].path === other.path && persisted.attachments[key][1].path === own.path;
      })()`), true, 'same-name uploads keep another uploader reference intact');
      console.log('PASS: user owns unlinked upload, edit modal, replacement, failed delete preservation, successful deletion');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'evidence-search') {
      const result = await evaluate(client, `(() => {
        evidenceLibrary = [{name:'policy.pdf',path:'upload/policy-register/policy.pdf',source:'Policy Register',policyDetails:[{title:'Access policy',subtitle:'Quarterly review',content:'Privileged accounts must be reviewed every quarter <script>unsafe</script>'}]},{name:'other.pdf',path:'upload/other.pdf',source:'Uploaded Files'}];
        const renders=[existingFilePicker('policy-test','privileged'),privacyFilePicker('privacy-policy-test','privileged'),isoEvidencePicker('iso|test','privileged')];
        const select=document.createElement('select'); select.multiple=true; document.body.appendChild(select);
        select.innerHTML=evidenceLibrary.map(file=>'<option value="'+escapeHtml(JSON.stringify(evidenceReference(file)))+'">'+escapeHtml(file.name)+'</option>').join('');
        select.options[0].selected=true; addEvidenceSelectSearch(select);
        select.previousElementSibling.value='quarterly'; select.previousElementSibling.dispatchEvent(new Event('input'));
        const selected=JSON.parse(select.selectedOptions[0].value);
        return {all:renders.every(html=>html.includes('policy.pdf') && !html.includes('other.pdf') && html.includes('Konten policy') && html.includes('&lt;script&gt;')),subtitle:!select.options[0].hidden && select.options[1].hidden,path:selected.path,noContent:!Object.hasOwn(selected,'policyDetails')};
      })()`);
      assert.deepEqual(result,{all:true,subtitle:true,path:'upload/policy-register/policy.pdf',noContent:true});
      for (const [attribute,searchAttribute,key,renderer] of [['existing-picker','existing-search','policy-test','existingFilePicker'],['privacy-existing-picker','privacy-existing-search','privacy-policy-test','privacyFilePicker'],['iso-existing-picker','iso-existing-search','iso|test','isoEvidencePicker']]) {
        await evaluate(client, `(() => {
          const host=document.createElement('div'); host.id='search-visibility-test';host.className='attachment-control';
          host.innerHTML='<input type="file"><div class="existing-file-picker visible" data-${attribute}="${key}">'+${renderer}('${key}')+'</div>';
          document.body.appendChild(host);
          host.querySelector('input[type="search"]').focus();
        })()`);
        assert.equal(await evaluate(client, `(() => { const search=document.querySelector('#search-visibility-test input[type="search"]');return getComputedStyle(search).display !== 'none' && search.getBoundingClientRect().height > 0 && getComputedStyle(document.querySelector('#search-visibility-test input[type="file"]')).display === 'none'; })()`),true);
        await client.send('Input.insertText',{text:'privileged'});
        assert.equal(await evaluate(client, `document.activeElement.matches('[data-${searchAttribute}]') && document.activeElement.value === 'privileged' && document.querySelector('#search-visibility-test').textContent.includes('Konten policy') && !document.querySelector('#search-visibility-test').textContent.includes('other.pdf')`),true);
        await evaluate(client, `document.querySelector('#search-visibility-test').remove()`);
      }
      console.log('PASS: CSF, Privacy and ISO search policy content/subtitles; snippets escape HTML; selection retains original file only');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'audit-evidence-form') {
      await evaluate(client, `(() => {
        const originalFetch=window.fetch;
        const rows=['audit','finding','followup','evidence'].map((kind,index)=>({id:'record-'+index,kind,parentId:index ? 'record-'+(index-1) : null,data:{title:kind,status:'Open',dueDate:'2026-12-31',attachmentPath:kind==='evidence' ? 'audit-finding/test/report.pdf' : undefined},filename:kind==='evidence' ? 'report.pdf' : null,canManageFile:kind==='evidence'}));
        window.fetch=(url,options)=>String(url)==='/api/audit-finding-tracker/available-files' ? Promise.resolve(new Response(JSON.stringify([{path:'policy-register/example.pdf',name:'Example policy.pdf',source:'Policy Register'}]),{status:200})) : String(url)==='/api/audit-finding-tracker' ? Promise.resolve(new Response(JSON.stringify(rows),{status:200})) : originalFetch(url,options);
        document.querySelector('[data-view="audit-finding-tracker"]').click();
      })()`);
      await waitFor(client, `document.querySelector('[data-aft-open="record-0"]')`, 'audit fixture');
      await evaluate(client, `document.querySelector('#aftManageTab').click(); document.querySelector('[data-aft-open="record-0"]').click(); document.querySelector('[data-aft-open="record-1"]').click(); document.querySelector('[data-aft-edit="record-2"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftDateLabel').textContent === 'Tanggal evidence' && document.querySelector('#aftDateColumn').textContent === 'Tanggal evidence' && document.querySelector('#aftExistingFile').hidden`), true);
      await evaluate(client, `document.querySelector('#aftCancel').click(); document.querySelector('[data-aft-open="record-2"]').click(); document.querySelector('[data-aft-edit="record-3"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftDateLabel').textContent === 'Tanggal evidence' && !document.querySelector('#aftExistingFile').hidden && document.querySelector('#aftExistingFileList').textContent.includes('report.pdf') && document.querySelector('#aftExistingFileList a').getAttribute('href').includes('/api/files/open/audit-finding/test/report.pdf') && !document.querySelector('#aftForm').elements.file.required`), true);
      await evaluate(client, `document.querySelector('[data-aft-remove-file]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftExistingFileList').textContent.includes('akan dihapus') && document.querySelector('#aftForm').elements.file.multiple`), true);
      await evaluate(client, `document.querySelector('[data-aft-remove-file]').click()`);
      assert.equal(await evaluate(client, `!document.querySelector('#aftExistingFileList').textContent.includes('akan dihapus')`), true);
      await evaluate(client, `document.querySelector('#aftCancel').click(); document.querySelector('#aftNew').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftExistingFile').hidden && !document.querySelector('#aftExistingFileList a') && !document.querySelector('#aftForm').elements.file.required`), true);
      await waitFor(client, `document.querySelector('[data-aft-library-path="policy-register/example.pdf"]')`, 'available library files');
      await evaluate(client, `document.querySelector('[data-aft-library-path="policy-register/example.pdf"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('[data-aft-library-path="policy-register/example.pdf"]').checked && !document.querySelector('#aftLibraryPanel').hidden`), true);
      console.log('PASS: follow-up/evidence date labels, existing file links, and new-form reset');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'role-actions') {
      await evaluate(client, `document.querySelector('#accountButton').click(); document.querySelector('[data-account-tab="permissions"]').click()`);
      await waitFor(client, `document.querySelector('#permissionChecks [data-permission-action="delete"]')`, 'action permission table');
      await evaluate(client, `document.querySelector('#permissionRoleSelect').value='user'; document.querySelector('#permissionRoleSelect').dispatchEvent(new Event('change'))`);
      assert.equal(await evaluate(client, `document.querySelectorAll('#permissionChecks [data-permission-key="risk-management"]').length === 4 && !document.querySelector('#permissionSaveButton').disabled`),true);
      await evaluate(client, `(() => {
        const original=window.fetch; window.roleActionPayload=null;
        window.fetch=(url,options)=>String(url)==='/api/auth/permissions/user' && options?.method==='PUT' ? (window.roleActionPayload=JSON.parse(options.body),Promise.resolve(new Response('[]',{status:200}))) : original(url,options);
        const read=document.querySelector('[data-permission-key="risk-management"][data-permission-action="read"]'); read.checked=false;read.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      assert.equal(await evaluate(client, `[...document.querySelectorAll('[data-permission-key="risk-management"]')].every(input=>!input.checked)`),true);
      await evaluate(client, `document.querySelector('[data-permission-key="risk-management"][data-permission-action="delete"]').click(); document.querySelector('#permissionSaveButton').click()`);
      await waitFor(client, `window.roleActionPayload`, 'role action save payload');
      assert.deepEqual(await evaluate(client, `window.roleActionPayload.actions['risk-management']`),{read:true,create:false,update:false,delete:true});
      await evaluate(client, `currentUserRole='user';currentUserActions={'risk-management':{read:true,create:false,update:false,delete:true}};const button=document.createElement('button');button.dataset.rmDelete='test';button.id='testRoleDelete';document.querySelector('#riskManagementView').appendChild(button);applyActionControls()`);
      assert.equal(await evaluate(client, `document.querySelector('#riskManagementNewButton').classList.contains('role-action-denied') && !document.querySelector('#testRoleDelete').classList.contains('role-action-denied')`),true);
      console.log('PASS: role action table, read dependency, save payload and per-action controls');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'admin-tabs') {
      await evaluate(client, `document.querySelector('#accountButton').click()`);
      await waitFor(client, `!document.querySelector('#accountAdminPanel').hidden`, 'admin account loaded');
      for (const [tab, panel] of [['permissions','permissionManagementPanel'],['matrix','accountAccessMatrixPanel'],['users','accountUsersPanel'],['audit','accountAuditPanel'],['smtp','accountSmtpPanel'],['storage','accountStoragePanel']]) {
        await evaluate(client, `document.querySelector('[data-account-tab="${tab}"]').click()`);
        assert.equal(await evaluate(client, `!document.querySelector('#${panel}').hidden && document.querySelector('[data-account-tab="${tab}"]').getAttribute('aria-selected') === 'true'`), true, `${tab}: ${errors.join('; ')}`);
      }
      await evaluate(client, `(() => {
        const originalFetch = window.fetch;
        window.fetch = (url, options) => String(url) === '/api/auth/users' ? Promise.reject(new Error('Simulated user-list outage')) : originalFetch(url, options);
        document.querySelector('#accountButton').click();
        document.querySelector('[data-account-tab="permissions"]').click();
      })()`);
      await waitFor(client, `document.querySelector('#accountUserStatus').textContent.includes('Sebagian data')`, 'isolated account loading failure');
      assert.equal(await evaluate(client, `!document.querySelector('#permissionManagementPanel').hidden && document.querySelector('#accountProfilePanel').hidden`), true);
      await evaluate(client, `currentUserRole = 'user'; setAccountTab('smtp')`);
      assert.equal(await evaluate(client, `document.querySelector('#accountAdminPanel').hidden && !document.querySelector('#accountProfilePanel').hidden && [...document.querySelectorAll('[data-account-tab]')].filter(button=>button.dataset.accountTab !== 'profile').every(button=>button.hidden && button.disabled)`), true);
      console.log('PASS: admin tabs work, failed user loading preserves selected tab, non-admin stays restricted');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'audit-template') {
      await evaluate(client, `(() => {
        const originalFetch = window.fetch;
        let saved = { enabled:false,daysBefore:7,recipients:[],subjectTemplate:'Tersimpan',bodyTemplate:'Isi tersimpan',smtpConfigured:false };
        window.fetch = (url, options) => String(url).endsWith('/audit-finding/reminder-settings') || String(url).endsWith('/audit-finding-tracker/reminder-settings')
          ? Promise.resolve(new Response(JSON.stringify(options?.method === 'PUT' ? (saved = { ...saved, ...JSON.parse(options.body) }) : saved),{status:200,headers:{'Content-Type':'application/json'}}))
          : originalFetch(url, options);
        document.querySelector('[data-view="audit-finding-tracker"]').click();
        document.querySelector('#aftSmtpTab').click();
      })()`);
      await waitFor(client, `document.querySelector('#aftReminderSubject').value === 'Tersimpan'`, 'legacy reminder settings');
      await evaluate(client, `document.querySelector('#aftReminderUseTemplate').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#aftReminderSubject').value.includes('{{auditTitle}}') && document.querySelector('#aftReminderBody').value.includes('Langkah yang perlu dilakukan:') && document.querySelector('#aftReminderPreviewBody').textContent.includes('PIC Audit') && !document.querySelector('#aftReminderUseTemplate').disabled`), true);
      await evaluate(client, `document.querySelector('#aftReminderSave').click()`);
      await waitFor(client, `document.querySelector('#aftReminderStatus').textContent.includes('Pengaturan tersimpan')`, 'template save');
      await evaluate(client, `document.querySelector('#aftReminderSubject').value = ''; document.querySelector('#aftReminderBody').value = ''; document.querySelector('#aftReminderReload').click()`);
      await waitFor(client, `document.querySelector('#aftReminderStatus').textContent === 'Pengaturan siap diedit.'`, 'saved template reload');
      assert.equal(await evaluate(client, `document.querySelector('#aftReminderSubject').value.includes('{{auditTitle}}') && document.querySelector('#aftReminderBody').value.includes('Langkah yang perlu dilakukan:') && document.querySelector('#aftReminderPreviewBody').textContent.includes('PIC Audit')`), true);
      console.log('PASS: template applies, saves, reloads, and preserves preview');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'policy-file-deletion') {
      await waitFor(client, `currentUserRole === 'admin' && !evidenceLibraryPending`, 'evidence permissions');
      assert.deepEqual(await evaluate(client, `(async()=>{
        const saved={fetch:window.fetch,confirm:window.confirm,library:evidenceLibrary,policies:policyRegisterRows,id:document.getElementById('policyRegisterId').value};
        const path='policy-register/policy-delete-verification.pdf';
        const file={path:'upload/'+path,name:'policy-delete-verification.pdf'};
        const keep={path:'upload/policy-register/keep.pdf',name:'keep.pdf'};
        let request='';
        try {
          evidenceLibrary=[file,keep];
          policyRegisterRows=[{id:'deletion-test',title:'Policy deletion verification',category:'Security',owner:'Test',reviewCycle:'Annual',approvalStatus:'Draft',lastReview:null,notes:'',items:[],attachmentPath:path,attachmentName:file.name,attachmentType:'application/pdf'}];
          document.getElementById('policyRegisterId').value='deletion-test';
          document.getElementById('policyRegisterFilePreview').hidden=false;
          renderPolicyRegisterRows();
          const before=document.getElementById('policyRegisterBody').textContent.includes(file.name);
          uploadedFileRecordMap.set('deletion-test',file);
          window.confirm=()=>true;
          window.fetch=(url,options={})=>{
            if(String(url).includes(path.split('/').map(encodeURIComponent).join('/')) && options.method==='DELETE') {request=String(url); return Promise.resolve(new Response(null,{status:204}));}
            if(String(url)==='/api/files?details=true')return Promise.resolve(new Response(JSON.stringify([keep]),{status:200,headers:{'Content-Type':'application/json'}}));
            return saved.fetch(url,options);
          };
          await deleteUploadedLibraryFile('deletion-test');
          return {before,original:request.endsWith('?library=true'),removedFromPolicy:!document.getElementById('policyRegisterBody').textContent.includes(file.name),policyRemains:policyRegisterRows.length===1,previewHidden:document.getElementById('policyRegisterFilePreview').hidden,libraryKeepsOther:evidenceLibrary.length===1&&evidenceLibrary[0].path===keep.path};
        }finally {window.fetch=saved.fetch;window.confirm=saved.confirm;evidenceLibrary=saved.library;policyRegisterRows=saved.policies;document.getElementById('policyRegisterId').value=saved.id;renderPolicyRegisterRows();renderUploadedFiles();}
      })()`), {before:true,original:true,removedFromPolicy:true,policyRemains:true,previewHidden:true,libraryKeepsOther:true}, 'original deletion must immediately clear the source Policy attachment');
      assert.deepEqual(errors,[], 'Browser errors'); console.log('Policy file deletion browser regression passed');return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'permissions') {
      assert.deepEqual(await evaluate(client, `(() => {
      const savedRole=currentUserRole, savedActions=currentUserActions;
      const input=document.createElement('input'); input.type='file'; input.dataset.attachment='permission-test';
      document.querySelector('#assessmentView').append(input);
      try {
        currentUserRole='viewer'; currentUserActions=Object.fromEntries(Object.keys(savedActions).map(key=>[key,{read:true,create:false,update:false,delete:false}]));
        applyActionControls();
        const denies=['csfManageNewButton','organizationPersonnelNewButton','roadmapCatalogNewButton','csfTopResetButton','riskRegisterResetButton'].every(id=>document.getElementById(id).classList.contains('role-action-denied'));
        currentUserActions.files.create=true; applyActionControls(); const moduleDenies=input.dataset.actionDenied==='true';
        currentUserActions.assessment.update=true; currentUserActions.files.create=false; applyActionControls(); const filesDenies=input.dataset.actionDenied==='true';
        currentUserActions.files.create=true; applyActionControls(); const bothAllow=input.dataset.actionDenied==='false';
        currentUserActions['personnel-certification'].create=true; applyActionControls(); const personnelAllows=!document.getElementById('organizationPersonnelNewButton').classList.contains('role-action-denied');
        currentUserActions['personnel-certification'].read=false; applyActionControls(); const noReadDenies=document.getElementById('organizationPersonnelNewButton').classList.contains('role-action-denied');
        return {denies,moduleDenies,filesDenies,bothAllow,personnelAllows,noReadDenies};
      } finally { input.remove(); currentUserRole=savedRole; currentUserActions=savedActions; applyActionControls(); }
    })()`), {denies:true,moduleDenies:true,filesDenies:true,bothAllow:true,personnelAllows:true,noReadDenies:true}, 'UI actions must follow feature permissions and require Read');

      assert.deepEqual(errors, [], 'Browser errors'); console.log('Access Settings browser regression passed'); return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'organization-png') {
    await evaluate(client, `document.querySelector('[data-view="personnel-certification"]').click()`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = await evaluate(client, `(async () => {
        organizationPersonnel = [{id: 991, personnelName: 'Direktur & Tim', personnelRole: 'Direktur', supervisorName: ''}, {id: 992, personnelName: 'Analis', personnelRole: 'Security Analyst', supervisorName: 'Direktur & Tim'}];
        personnelCertifications = [];
        renderOrganizationPersonnelStructure();
        const create = URL.createObjectURL;
        const click = HTMLAnchorElement.prototype.click;
        let output;
        URL.createObjectURL = blob => { output = blob; return create(blob); };
        HTMLAnchorElement.prototype.click = function () {};
        try {
          await exportOrganizationPng();
          if (!output) return {status: document.querySelector('#organizationExportStatus').textContent};
          const bitmap = await createImageBitmap(output);
          const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
          const pixels = ctx.getImageData(0, 112, canvas.width, canvas.height - 112).data;
          let colored = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 240 && pixels[i + 1] < 240) colored++;
          return {type: output.type, size: output.size, colored, status: document.querySelector('#organizationExportStatus').textContent};
        } finally { URL.createObjectURL = create; HTMLAnchorElement.prototype.click = click; }
      })()`);
      assert.equal(result.type, 'image/png', JSON.stringify(result));
      assert.ok(result.size > 1000);
      assert.ok(result.colored > 100, 'PNG must contain chart content below the title');
      console.log('PASS: organization PNG contains rendered hierarchy and downloads successfully');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'personnel-access') {
      await evaluate(client, `document.querySelector('[data-view="personnel-certification"]').click()`);
      assert.equal(await evaluate(client, `!document.querySelector('#personnelOrganizationPanel').hidden && document.querySelector('#personnelRegisterPanel').hidden`), true);
      await evaluate(client, `document.querySelector('[data-personnel-tab="register"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#personnelOrganizationPanel').hidden && !document.querySelector('#personnelRegisterPanel').hidden && document.querySelector('#personnelRegisterPanel').contains(document.querySelector('#organizationPersonnelBody'))`), true);
      await evaluate(client, `(() => {
        organizationPersonnel = [{ id: 99, personnelName: 'Test Employee', employeeId: 'TEST', personnelRole: 'Analyst', supervisorName: '' }];
        personnelCertifications = [];
        currentUserPermissions = ['personnel-certification'];
        currentUserRole = 'user';
        renderOrganizationPersonnelStructure();
        renderCertificationPersonnelOptions();
      })()`);
      assert.equal(await evaluate(client, `document.querySelector('#organizationPersonnelNewButton').hidden && !document.querySelector('[data-organization-edit]') && !document.querySelector('[data-organization-delete]')`), true);
      await evaluate(client, `openOrganizationPersonnelForm()`);
      assert.equal(await evaluate(client, `document.querySelector('#organizationPersonnelModal').open`), false);
      await evaluate(client, `document.querySelector('[data-organization-certify="99"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#certificationModal').open && document.querySelector('#certificationPersonnelId').value === '99' && document.querySelector('#certificationEmployeeId').readOnly`), true);
      await evaluate(client, `document.querySelector('#certificationCancel').click(); currentUserRole = 'admin'; setPersonnelCertificationTab('register'); document.querySelector('#organizationPersonnelNewButton').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#organizationPersonnelModal').open && !document.querySelector('#organizationPersonnelNewButton').hidden && !!document.querySelector('[data-organization-edit]')`), true);
      await evaluate(client, `document.querySelector('#organizationPersonnelCancel').click(); currentUserRole = 'viewer'; renderOrganizationPersonnelStructure()`);
      assert.equal(await evaluate(client, `document.querySelector('#certificationNewButton').hidden && !document.querySelector('[data-organization-certify]')`), true);
      console.log('PASS: admin employee management, user existing-employee certification, viewer read-only controls');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'risk-management') {
      await evaluate(client, `document.querySelector('[data-view="risk-management"]').click()`);
      const panels = () => evaluate(client, `({ dashboard: !document.querySelector('#riskDashboardPanel').hidden, register: !document.querySelector('#riskRegisterPanel').hidden })`);
      assert.deepEqual(await panels(), { dashboard: true, register: false });
      await evaluate(client, `document.querySelector('#riskManagementNewButton').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#riskManagementModal').open && document.querySelector('#riskManagementModal').getBoundingClientRect().width > 0`), true);
      await evaluate(client, `document.querySelector('#riskRegisterCancel').click()`);
      for (let round = 0; round < 3; round++) {
        await evaluate(client, `document.querySelector('[data-risk-tab="register"]').click()`);
        assert.deepEqual(await panels(), { dashboard: false, register: true });
        await evaluate(client, `document.querySelector('[data-risk-tab="dashboard"]').click()`);
        assert.deepEqual(await panels(), { dashboard: true, register: false });
      }
      await evaluate(client, `document.querySelector('[data-view="framework"]').click(); document.querySelector('[data-view="risk-management"]').click()`);
      assert.deepEqual(await panels(), { dashboard: true, register: false });
      console.log('PASS: initial Dashboard, New Risk modal, repeated tab switching, and return navigation');
      return;
    }

    if (process.env.BROWSER_TEST_FOCUS === 'risk-acceptance') {
      await evaluate(client, `(() => {
        const originalFetch = window.fetch;
        let records = [];
        window.fetch = async (url, options = {}) => {
          if (typeof url !== 'string' || !url.startsWith('/api/risk-acceptance')) return originalFetch(url, options);
          const method = options.method || 'GET';
          if (method === 'POST') records = [{ ...JSON.parse(options.body), id: 'test-risk', updatedAt: '2026-09-29' }];
          if (method === 'PUT') records = [{ ...records[0], ...JSON.parse(options.body) }];
          if (method === 'DELETE') records = [];
          return new Response(JSON.stringify(method === 'GET' ? records : records[0] || {}), { status: 200 });
        };
        document.querySelector('[data-view="risk-acceptance"]').click();
        document.querySelector('#riskAcceptanceListTab').click();
        document.querySelector('#riskAcceptanceNew').click();
      })()`);
      assert.equal(await evaluate(client, `document.querySelector('#riskAcceptanceModal').open`), true);
      await evaluate(client, `(() => {
        for (const id of ['riskRequestorName', 'riskAssetName', 'riskDepartment', 'riskDescription', 'riskBenefitJustification', 'riskMitigationPlan']) document.getElementById(id).value = 'Browser fixture';
        document.querySelector('#riskAcceptanceForm').requestSubmit();
      })()`);
      await waitFor(client, `!document.querySelector('#riskAcceptanceModal').open && document.querySelector('[data-risk-view="test-risk"]')`, 'risk create');
      assert.equal(await evaluate(client, `document.querySelector('#riskAcceptanceApproved').textContent`), '1');
      await evaluate(client, `document.querySelector('[data-risk-view="test-risk"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#riskAcceptanceModal').open && document.querySelector('#riskAssetName').disabled && !document.querySelector('#riskAcceptanceCancel').hidden`), true);
      await evaluate(client, `document.querySelector('#riskAcceptanceCancel').click(); document.querySelector('[data-risk-edit="test-risk"]').click(); document.querySelector('#riskAssetName').value = 'Updated fixture'; document.querySelector('#riskCisDecision').value = 'conditional'; document.querySelector('#riskAcceptanceForm').requestSubmit()`);
      await waitFor(client, `!document.querySelector('#riskAcceptanceModal').open && document.querySelector('#riskAcceptanceBody').textContent.includes('Updated fixture')`, 'risk update');
      assert.equal(await evaluate(client, `document.querySelector('#riskAcceptanceConditional').textContent`), '1');
      await evaluate(client, `document.querySelector('[data-risk-delete="test-risk"]').click()`);
      assert.equal(await evaluate(client, `document.querySelector('#riskAcceptanceDeleteModal').open`), true);
      await evaluate(client, `document.querySelector('#riskAcceptanceDeleteCancel').click()`);
      assert.equal(await evaluate(client, `!!document.querySelector('[data-risk-delete="test-risk"]')`), true);
      await evaluate(client, `document.querySelector('[data-risk-delete="test-risk"]').click(); document.querySelector('#riskAcceptanceDeleteConfirm').click()`);
      await waitFor(client, `!document.querySelector('#riskAcceptanceDeleteModal').open && document.querySelector('#riskAcceptanceTotal').textContent === '0'`, 'risk delete');
      await evaluate(client, `document.querySelector('#riskAcceptanceDashboardTab').click()`);
      assert.equal(await evaluate(client, `!document.querySelector('#riskAcceptanceDashboardPanel').hidden && document.querySelector('#riskAcceptanceListPanel').hidden`), true);
      for (const width of [1440, 768, 390]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
        await evaluate(client, `document.querySelector('#riskAcceptanceListTab').click(); document.querySelector('#riskAcceptanceNew').click()`);
        assert.equal(await evaluate(client, `(() => { const rect = document.querySelector('#riskAcceptanceModal').getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })()`), true);
        await evaluate(client, `document.querySelector('#riskAcceptanceClose').click()`);
      }
      console.log(JSON.stringify({ status: 'passed', feature: 'risk-acceptance', api: 'in-browser fixtures', checks: ['tabs', 'create', 'read-only detail', 'update', 'cancel delete', 'delete', 'dashboard counts', 'responsive modal'] }, null, 2));
      return;
    }

    await evaluate(client, `document.querySelector('[data-view="audit-finding-tracker"]').click()`);
    await waitFor(client, `!document.querySelector('#aftNew').disabled`, 'audit tracker data');
    await evaluate(client, `document.querySelector('[data-aft-tab="manage"]').click()`);
    await evaluate(client, `document.querySelector('#aftNew').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#aftModal').open`), true);
    await evaluate(client, `document.querySelector('#aftCancel').click()`);
    for (const width of [1440, 768, 390]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await delay(100);
      assert.equal(await evaluate(client, `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`), false, `Tracker overflow at ${width}px`);
    }
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
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
    assert.deepEqual(await evaluate(client, `fetch('/app').then(response => response.text()).then(html => html.includes('/vue/assets/'))`), true);

    const views = ['framework', 'csf', 'csf-manage', 'privacy', 'privacy-manage', 'iso27001', 'risk-acceptance', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'backups', 'file-backups'];
    for (const view of views) {
      const opened = await evaluate(client, `(() => { const button = document.querySelector('[data-view="${view}"]'); if (!button || button.hidden || button.disabled) return false; button.click(); return true; })()`);
      assert.equal(opened, true, `Navigation unavailable: ${view}`);
      await delay(180);
    }
    assert.deepEqual(await evaluate(client, `(() => {
      const panel = document.querySelector('#fileBackupsView');
      const group = document.querySelector('#backupNavGroup');
      const input = document.querySelector('#fileBackupRestoreInput');
      const button = document.querySelector('#fileBackupRestoreButton');
      const initiallyDisabled = button.disabled;
      const transfer = new DataTransfer();
      transfer.items.add(new File(['test archive'], 'browser-check.zip', { type: 'application/zip' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const selectionWorks = !button.disabled && document.querySelector('#fileBackupRestoreFileName').textContent === 'browser-check.zip';
      const originalConfirm = window.confirm;
      window.confirm = () => false;
      button.click();
      window.confirm = originalConfirm;
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { active: panel.classList.contains('active-view'), grouped: group.contains(document.querySelector('[data-view="backups"]')) && group.contains(document.querySelector('[data-view="file-backups"]')), initiallyDisabled, selectionWorks, cleared: button.disabled };
    })()`), { active: true, grouped: true, initiallyDisabled: true, selectionWorks: true, cleared: true }, 'File Backup navigation and restore selection must work');
    if (process.env.BROWSER_TEST_FOCUS === 'file-backups') {
      assert.deepEqual(errors, [], 'Browser errors');
      assert.deepEqual(failedResponses, [], 'Failed requests');
      console.log(JSON.stringify({ status: 'passed', focus: 'file-backups', viewsChecked: views.length, restoreSelection: true }));
      return;
    }
    assert.equal(await evaluate(client, `(() => { const button = document.querySelector('#accountButton'); if (!button || button.hidden || button.disabled) return false; button.click(); return document.querySelector('#accountView').classList.contains('active-view'); })()`), true, `Account navigation unavailable: ${JSON.stringify(errors)}`);
    assert.deepEqual(await evaluate(client, `([...document.querySelectorAll('#accountView [data-account-tab]')].map(button => button.dataset.accountTab))`), ['profile', 'permissions', 'matrix', 'users', 'audit', 'smtp', 'storage'], 'Account tabs are incomplete');
    assert.deepEqual(await evaluate(client, `(() => { document.querySelector('[data-account-tab="storage"]').click(); return { visible: !document.querySelector('#accountStoragePanel').hidden, inAccount: document.querySelector('#accountStoragePanel #fileStorageForm') !== null, removedFromFiles: document.querySelector('#filesView #fileStorageForm') === null }; })()`), { visible: true, inAccount: true, removedFromFiles: true }, 'Storage settings must be in the Account storage tab');
    assert.equal(await evaluate(client, `(() => { const button = document.querySelector('#accountView [data-account-tab="audit"]'); button?.click(); return document.querySelector('#accountAuditPanel')?.hidden === false && document.querySelector('#accountProfilePanel')?.hidden === true; })()`), true, 'Account audit tab unavailable');
    assert.equal(await evaluate(client, `(() => { document.querySelector('#accountView [data-account-tab="profile"]')?.click(); return document.querySelector('#accountProfilePanel')?.hidden === false; })()`), true, 'Account profile tab unavailable');

    await evaluate(client, `document.querySelector('[data-view="personnel-certification"]').click()`);
    await waitFor(client, `['organization','map','reference'].every(tab=>document.querySelector('[data-personnel-tab="'+tab+'"]'))`, 'personnel tabs');
    assert.equal(await evaluate(client, `['assessmentView', 'privacyAssessmentView', 'iso27001View', 'riskAcceptanceView', 'riskManagementView', 'policyRegisterView', 'personnelCertificationView'].every(id => { const toolbar = document.querySelector('#' + id + ' [data-module-transfer]'); return toolbar && ['import', 'export', 'report'].every(action => toolbar.querySelector('[data-' + action + ']')); })`), true, 'Module import/export/report toolbars are incomplete');
    for (const tab of ['organization', 'map', 'reference']) {
      assert.equal(await evaluate(client, `(() => { const button = document.querySelector('[data-personnel-tab="${tab}"]'); button.click(); return !button.hidden; })()`), true);
    }

    for (const [view, selector, values] of [
      ['csf', 'data-csf-tab', ['overview', 'core']],
      ['privacy', 'data-privacy-tab', ['overview', 'core']],
      ['iso27001', 'data-iso-tab', ['dashboard', 'objectives', 'objective-calendar', 'clauses', 'soa']],
      ['risk-management', 'data-risk-tab', ['dashboard', 'register', 'options']],
      ['risk-acceptance', 'data-risk-acceptance-tab', ['dashboard', 'list']],
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
      ['risk-acceptance', 'riskAcceptanceNew', 'riskAcceptanceModal', 'riskAcceptanceCancel'],
    ]) {
      await evaluate(client, `document.querySelector('[data-view="${view}"]').click()`);
      if (view === 'personnel-certification') await evaluate(client, `document.querySelector('[data-personnel-tab="register"]').click()`);
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
