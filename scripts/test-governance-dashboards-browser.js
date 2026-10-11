// Test built workspace with browser-local fixtures; never write business records.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Cdp } = require('./test-threat-modelling-browser');
const { pool } = require('../src/config/database');
const { createSession } = require('../src/config/auth');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  let server, chrome, client;
  const profile = path.join(os.tmpdir(), `nist-governance-dashboard-${Date.now()}`);
  try {
    const admin = (await pool.query("SELECT username FROM app_users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0];
    const token = createSession({ username: admin.username, role: 'admin' });
    server = require('../src/app').listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`, debugPort = 9700 + Math.floor(Math.random() * 100);
    chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let target;
    for (let i = 0; i < 100; i++) { try { target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await delay(100); } }
    assert.ok(target); client = new Cdp(target.webSocketDebuggerUrl); await client.connect();
    await client.send('Page.enable'); await client.send('Runtime.enable');
    await client.send('Network.setCookie', { name: 'nist_session', value: token, url: base, httpOnly: true });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await client.send('Page.navigate', { url: `${base}/app` });
    await client.wait('document.documentElement.dataset.frontend === "vue"');
    await client.evaluate(`(() => {
      const originalFetch = window.fetch;
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const date = days => new Date(Date.parse(today+'T00:00:00Z') + days*86400000).toISOString().slice(0,10);
      const lastYear = days => { const value = new Date(date(days)+'T00:00:00Z'); value.setUTCFullYear(value.getUTCFullYear()-1); return value.toISOString().slice(0,10); };
      window.gdFixtureDate = date(10);
      window.afFixtures = [
        {id:'audit-a',kind:'audit',parentId:null,data:{title:'Security audit',status:'Open'}},
        {id:'audit-b',kind:'audit',parentId:null,data:{title:'Operations audit',status:'Open'}},
        ...[['Critical','Open',-1,'Alice','audit-a'],['High','In progress',10,'Bob','audit-a'],['Low','Closed',-3,'Alice','audit-a'],['Medium','Open',0,'Bob','audit-a'],['High','Closed',15,'Carol','audit-b'],['Medium','Open',null,'Carol','audit-b']].map(([severity,status,days,owner,parentId],i)=>({id:'finding-'+i,kind:'finding',parentId,data:{title:i===0?'<img src=x onerror=alert(1)> finding':'Finding '+i,severity,status,owner,dueDate:days===null?'':date(days),description:'Fixture details'}})),
        {id:'followup-a',kind:'followup',parentId:'finding-0',data:{title:'Correct access',status:'Open'}},
        {id:'followup-b',kind:'followup',parentId:'finding-1',data:{title:'Review controls',status:'Closed'}},
        {id:'evidence-a',kind:'evidence',parentId:'followup-a',data:{title:'Evidence',status:'Open',attachments:[]},attachments:[],canManageFile:false}
      ];
      window.pdFixtures = [
        ['=unsafe title','Security','Alice','Approved','Annual',lastYear(-1)],
        ['Access policy','Security','Bob','Draft','Annual',lastYear(10)],
        ['Operations policy','Operations','Carol','Approved','Annual',lastYear(40)],
        ['Ad hoc policy','Operations','Alice','Rejected','Ad hoc',today],
        ['Missing review','Security','Bob','Review due','Quarterly',''],
        ['Unknown cycle','Operations','Carol','Approved','Unknown',today],
        ['Review today','Security','Alice','Approved','Annual',lastYear(0)]
      ].map(([title,category,owner,approvalStatus,reviewCycle,lastReview],index)=>({id:index+1,title,category,owner,approvalStatus,reviewCycle,lastReview,items:[],relatedNoteIds:[],notes:'Fixture',attachmentName:index===0?'evidence.pdf':'',attachmentPath:index===0?'policy-register/fixture.pdf':''}));
      window.gdRequests = {audit:0,policy:0};
      window.fetch = async (url, options={}) => {
        const method = options.method || 'GET';
        if (url === '/api/audit-finding-tracker' && method === 'GET') { gdRequests.audit++; return new Response(JSON.stringify(afFixtures),{status:200}); }
        if (url === '/api/policy-register' && method === 'GET') { gdRequests.policy++; return new Response(JSON.stringify(pdFixtures),{status:200}); }
        if (['finding-', 'audit-', 'followup-'].some(kind=>String(url).startsWith('/api/audit-finding-tracker/'+kind)) && method === 'PUT') {
          const id=String(url).split('/').pop(), record=afFixtures.find(r=>r.id===id); record.data={...record.data,...Object.fromEntries(options.body.entries())};
          return new Response(JSON.stringify(record),{status:200});
        }
        return originalFetch(url,options);
      };
      window.gdDownloads=[];
      HTMLAnchorElement.prototype.click=function(){if(this.download){const record={name:this.download,url:this.href};gdDownloads.push(record);record.loading=fetch(this.href).then(r=>r.text()).then(text=>{record.text=text;});}};
      document.querySelector('[data-view="audit-finding-tracker"]').click();
    })()`);
    await client.wait('document.querySelector("#aftOpenCount").textContent === "4"');
    assert.equal(await client.evaluate('document.querySelector("#aftAuditCount").textContent'), '2');
    for (const [kind, count] of [['high', 2], ['overdue', 1], ['closed', 2], ['soon', 2]]) {
      assert.equal(await client.evaluate(`document.querySelector('[data-af-kpi="${kind}"] strong').textContent`), String(count));
      await client.evaluate(`document.querySelector('[data-af-kpi="${kind}"]').click()`);
      assert.equal(await client.evaluate('document.querySelector("#aftManagePanel").hidden'), false);
      assert.equal(await client.evaluate('document.querySelectorAll("#aftBody > tr").length'), count);
      await client.evaluate('document.querySelector("#afBackDashboard").click()');
    }
    assert.equal(await client.evaluate('document.querySelectorAll("#aftDashboardPanel table").length'), 0);
    assert.equal(await client.evaluate('document.querySelectorAll("#auditFindingView img").length'), 0);
    await client.evaluate('document.querySelector("#afAudit").value="audit-a";document.querySelector("#afAudit").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#afOwner").value="Alice";document.querySelector("#afOwner").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#aftOpenCount").textContent'), '1');
    assert.equal(await client.evaluate('document.querySelector("#aftClosedFindingCount").textContent'), '1');
    await client.evaluate('document.querySelector("#afReset").click();document.querySelector("[data-af-severity=Critical]").click()');
    assert.equal(await client.evaluate('document.querySelectorAll("#aftBody > tr").length'), 1);
    await client.evaluate('document.querySelector("#afBackDashboard").click();document.querySelector("#afMonth").value=gdFixtureDate.slice(0,7);document.querySelector("#afMonth").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(`[data-af-date="${gdFixtureDate}"]`).click()');
    assert.equal(await client.evaluate('document.querySelectorAll("#aftBody > tr").length'), 1);
    await client.evaluate('document.querySelector("#afListReset").click();document.querySelector("#afBackDashboard").click();document.querySelector("#afAlertsButton").click()');
    assert.equal(await client.evaluate('document.querySelectorAll("#afAlerts button").length'), 3);
    await client.evaluate('document.querySelector("#afAlerts [data-af-record=finding-0]").click();document.querySelector("[data-aft-open=finding-0]").click()');
    assert.ok(await client.evaluate('document.querySelector("#aftBody").textContent.includes("Correct access")'));
    await client.evaluate('document.querySelector("[data-aft-open=followup-a]").click()');
    assert.ok(await client.evaluate('document.querySelector("#aftBody").textContent.includes("Evidence")'));
    await client.evaluate('document.querySelector("#afListReset").click();document.querySelector("#afBackDashboard").click();document.querySelector("[data-af-kpi=overdue]").click();document.querySelector("[data-aft-edit=finding-0]").click();document.querySelector("#aftForm").elements.status.value="Closed";document.querySelector("#aftForm").requestSubmit()');
    await client.wait('!document.querySelector("#aftModal").open && document.querySelector("#aftOverdueFindingCount").textContent === "0"');
    console.log('Browser check: audit KPIs, filters, calendar, drill-down, hierarchy and edit verified');
    await client.evaluate('document.querySelector("#afListReset").click();document.querySelector("#afBackDashboard").click();document.querySelector("#afExport").value="json";document.querySelector("#afExport").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('gdDownloads.at(-1).loading.then(()=>JSON.parse(gdDownloads.at(-1).text).length)'), 11);
    const auditCalls = await client.evaluate('gdRequests.audit');
    await client.evaluate('document.querySelector("#aftDashboardRefresh").click()');
    await client.wait(`gdRequests.audit === ${auditCalls + 1} && document.querySelector('#aftStatus').textContent.includes('berhasil')`);
    await client.evaluate('document.querySelector("[data-view=policy-register]").click()');
    await client.wait('document.querySelector("#policyRegisterTotalValue").textContent === "7"');
    for (const [kind, count] of [['approved', 4], ['soon', 2], ['overdue', 1], ['missing', 2], ['attachment', 1]]) {
      assert.equal(await client.evaluate(`document.querySelector('[data-pd-kpi="${kind}"] strong').textContent`), String(count));
      await client.evaluate(`document.querySelector('[data-pd-kpi="${kind}"]').click()`);
      assert.equal(await client.evaluate('document.querySelector("#policyRegisterPanel").hidden'), false);
      assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#policyRegisterBody tr[data-policy-id]")).filter(r=>!r.hidden).length'), count);
      await client.evaluate('document.querySelector("#pdBackDashboard").click()');
    }
    await client.evaluate('document.querySelector("#pdReset").click();document.querySelector("#pdCategory").value="Security";document.querySelector("#pdCategory").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#pdOwner").value="Alice";document.querySelector("#pdOwner").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.equal(await client.evaluate('document.querySelector("#policyRegisterTotalValue").textContent'), '2');
    await client.evaluate('document.querySelector("[data-pd-status=Approved]").click()');
    assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#policyRegisterBody tr[data-policy-id]")).filter(r=>!r.hidden).length'), 2);
    await client.evaluate('document.querySelector("#policyRegisterSearch").value="unsafe";document.querySelector("#policyRegisterSearch").dispatchEvent(new Event("input",{bubbles:true}))');
    assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#policyRegisterBody tr[data-policy-id]")).filter(r=>!r.hidden).length'), 1);
    await client.evaluate('document.querySelector("#pdExport").value="csv";document.querySelector("#pdExport").dispatchEvent(new Event("change",{bubbles:true}))');
    assert.ok(await client.evaluate('gdDownloads.at(-1).loading.then(()=>gdDownloads.at(-1).text).then(text=>text.includes("\'=unsafe title")&&!text.includes("Access policy"))'));
    await client.evaluate('document.querySelector("#policyRegisterExportButton").click()');
    assert.equal(await client.evaluate('gdDownloads.at(-1).loading.then(()=>JSON.parse(gdDownloads.at(-1).text).length)'), 1);
    await client.evaluate('document.querySelector("#pdListReset").click();document.querySelector("#pdBackDashboard").click();document.querySelector("#pdMonth").value=gdFixtureDate.slice(0,7);document.querySelector("#pdMonth").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector(`[data-pd-date="${gdFixtureDate}"]`).click()');
    assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#policyRegisterBody tr[data-policy-id]")).filter(r=>!r.hidden).length'), 1);
    await client.evaluate('document.querySelector("#pdListReset").click();document.querySelector("#pdBackDashboard").click();document.querySelector("#pdAlertsButton").click()');
    assert.equal(await client.evaluate('document.querySelectorAll("#pdAlerts button").length'), 5);
    await client.evaluate('document.querySelector("[data-pd-record]").click()');
    assert.equal(await client.evaluate('Array.from(document.querySelectorAll("#policyRegisterBody tr[data-policy-id]")).filter(r=>!r.hidden).length'), 1);
    await client.evaluate('document.querySelector("#pdListReset").click();document.querySelector("#pdBackDashboard").click()');
    const policyCalls = await client.evaluate('gdRequests.policy');
    await client.evaluate('document.querySelector("#pdRefresh").click()');
    await client.wait(`gdRequests.policy === ${policyCalls + 1} && !document.querySelector('#pdRefresh').disabled`);
    console.log('Browser check: policy review dates, KPIs, filters, calendar, search, alerts and filtered exports verified');
    await fs.mkdir('output', { recursive: true });
    for (const view of ['audit-finding-tracker', 'policy-register']) {
      await client.evaluate(`document.querySelector('[data-view="${view}"]').click()`);
      await client.wait(view === 'policy-register' ? '!document.querySelector("#pdRefresh").disabled' : 'document.querySelector("#aftStatus").textContent.includes("berhasil")');
      if (view === 'policy-register') await client.evaluate('document.querySelector("[data-policy-tab=dashboard]").click()');
      for (const width of [1440, 768, 390]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }); await delay(100);
        assert.equal(await client.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1'), false, `${view} overflow at ${width}`);
        const kpis = view === 'policy-register' ? 'pdKpis' : 'afKpis';
        assert.equal(await client.evaluate(`Array.from(document.querySelectorAll('#${kpis} button')).every(b=>b.getBoundingClientRect().right<=document.documentElement.clientWidth+1)`), true, `${view} KPI overflow`);
        await client.evaluate(`NistTheme.set('dark')`); await delay(250);
        assert.equal(await client.evaluate(`getComputedStyle(document.querySelector('#${kpis} button')).backgroundColor`), 'rgb(26, 38, 56)');
        await client.evaluate(`NistTheme.set('light')`); await delay(250);
        if (width === 1440) { const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await fs.writeFile(`output/${view}-dashboard-preview.png`, Buffer.from(screenshot.data, 'base64')); }
        await client.evaluate(view === 'policy-register' ? 'document.querySelector("[data-policy-tab=register]").click()' : 'document.querySelector("[data-aft-tab=manage]").click()');
        assert.equal(await client.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1'), false, `${view} list overflow at ${width}`);
        await client.evaluate(view === 'policy-register' ? 'document.querySelector("#pdBackDashboard").click()' : 'document.querySelector("#afBackDashboard").click()');
      }
    }
    assert.deepEqual(client.errors, []);
    console.log(JSON.stringify({ status: 'passed', modules: ['Audit Finding Tracker', 'Policy Register'], kpis: true, filters: true, calendar: true, drillDown: true, hierarchy: true, edit: true, alerts: true, filteredExports: true, darkTheme: true, viewports: [1440, 768, 390] }));
  } finally {
    client?.socket.close(); chrome?.kill(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await pool.end();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {});
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
