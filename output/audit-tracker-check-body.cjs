async function run() {
  const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let client;
  const prefix = 'AFT-check-' + Date.now();
  try {
    await waitForChrome();
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl + '/login')}`, { method: 'PUT' })).json();
    client = new CdpClient(target.webSocketDebuggerUrl); await client.connect();
    await client.send('Runtime.enable'); await client.send('Page.enable');
    await waitFor(client, `document.querySelector('#loginForm')`, 'login');
    await evaluate(client, `document.querySelector('#username').value=${JSON.stringify(username)}; document.querySelector('#password').value=${JSON.stringify(password)}; document.querySelector('#loginForm').requestSubmit()`);
    await waitFor(client, `document.documentElement.dataset.frontend === 'vue' && document.querySelector('[data-view="audit-finding-tracker"]')`, 'workspace');
    await delay(1000);
    await evaluate(client, `document.querySelector('[data-view="audit-finding-tracker"]').click()`);
    await waitFor(client, `!document.querySelector('#aftNew').disabled`, 'tracker API');
    await evaluate(client, `document.querySelector('#aftReminderPanel').open=true`);
    await waitFor(client, `document.querySelector('#aftReminderStatus').textContent==='Pengaturan siap diedit.'`, 'reminder settings');
    assert.equal(await evaluate(client, `document.querySelector('#aftReminderPanel').hidden`), false);
    assert.equal(await evaluate(client, `document.querySelector('#aftReminderEnabled').checked`), false);
    assert.ok(await evaluate(client, `document.querySelector('#aftReminderPanel').textContent.includes('Judul:') && document.querySelector('#aftReminderPanel').textContent.includes('Finding:')`));
    await evaluate(client, `document.querySelector('#aftReminderSmtp').click()`);
    await waitFor(client, `!document.querySelector('#accountSmtpPanel').hidden`, 'central SMTP navigation');
    await evaluate(client, `document.querySelector('[data-view="audit-finding-tracker"]').click()`);
    await waitFor(client, `!document.querySelector('#aftNew').disabled`, 'return to tracker');
    await evaluate(client, `document.querySelector('#aftReminderPanel').open=false`);
    for (const [level, kind] of ['audit', 'finding', 'followup', 'evidence'].entries()) {
      await evaluate(client, `document.querySelector('#aftNew').click()`);
      await waitFor(client, `document.querySelector('#aftModal').open`, 'form');
      await evaluate(client, `(() => { const form=document.querySelector('#aftForm'); form.elements.title.value=${JSON.stringify(prefix)}+'-${kind}'; form.elements.owner.value='Test PIC'; form.elements.description.value='Browser verification'; ${kind === 'evidence' ? "const transfer=new DataTransfer(); transfer.items.add(new File(['audit-proof'], 'proof.txt', {type:'text/plain'})); form.elements.file.files=transfer.files;" : ''} form.requestSubmit(); })()`);
      await waitFor(client, `!document.querySelector('#aftModal').open && !document.querySelector('#aftNew').disabled && document.querySelector('#aftBody').innerText.includes(${JSON.stringify(prefix + '-' + kind)})`, 'saved ' + kind);
      if (level < 3) await evaluate(client, `Array.from(document.querySelectorAll('#aftBody tr')).find(row=>row.innerText.includes(${JSON.stringify(prefix + '-' + kind)})).querySelector('[data-aft-open]').click()`);
    }
    assert.equal(await evaluate(client, `fetch(document.querySelector('#aftBody a').href).then(r=>r.text())`), 'audit-proof');
    await evaluate(client, `document.querySelector('#aftBody [data-aft-edit]').click(); document.querySelector('#aftForm').elements.description.value='Updated evidence'; document.querySelector('#aftForm').requestSubmit()`);
    await waitFor(client, `!document.querySelector('#aftModal').open && document.querySelector('#aftBody').innerText.includes('Updated evidence')`, 'update evidence');
    assert.equal(await evaluate(client, `fetch(document.querySelector('#aftBody a').href).then(r=>r.text())`), 'audit-proof');
    await evaluate(client, `(async()=>{
      const records=await (await fetch('/api/audit-finding-tracker')).json();
      const audit=records.find(r=>r.data.title===${JSON.stringify(prefix + '-audit')});
      const finding=records.find(r=>r.data.title===${JSON.stringify(prefix + '-finding')});
      for(const row of [audit,finding]) {
        const response=await fetch('/api/audit-finding-tracker/'+row.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...row.data,kind:row.kind,dueDate:'2000-01-01'})});
        if(!response.ok)throw new Error('Fixture update failed');
      }
      for(const [suffix,status,dueDate] of [['closed','Closed','2000-01-01'],['future','Open','2099-01-01'],['undated','Open','']]) {
        const response=await fetch('/api/audit-finding-tracker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'finding',parentId:audit.id,title:${JSON.stringify(prefix)}+'-'+suffix,status,dueDate})});
        if(!response.ok)throw new Error('Fixture create failed');
      }
      document.querySelector('#aftBreadcrumb [data-aft-level="0"]').click();
      document.querySelector('#aftRefresh').click();
    })()`);
    await waitFor(client, `document.querySelector('#aftBody').innerText.includes('4 finding') && !document.querySelector('#aftNew').disabled`, 'audit summary');
    const detailResult = await evaluate(client, `(() => {
      const detail=Array.from(document.querySelectorAll('[data-aft-details]')).find(d=>d.closest('tr').children[0].textContent.includes(${JSON.stringify(prefix)}));
      detail.open=true; window.aftTestDetail=detail;
      return {summary:detail.querySelector('summary').textContent, text:detail.innerText, overdue:detail.closest('td').innerText.includes('1 lewat tenggat'), audits:Number(document.querySelector('#aftOverdueAuditCount').textContent), findings:Number(document.querySelector('#aftOverdueFindingCount').textContent)};
    })()`);
    assert.equal(detailResult.summary,'Lihat 3 finding belum selesai');
    assert.equal(detailResult.overdue,true);
    assert.ok(detailResult.audits>=1 && detailResult.findings>=1);
    assert.equal(detailResult.text.includes(prefix+'-closed'),false);
    assert.ok(detailResult.text.includes(prefix+'-future') && detailResult.text.includes(prefix+'-undated'));
    for (const width of [1440,768,390]) {
      await client.send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:width<600});
      assert.equal(await evaluate(client, `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`), false, 'overflow '+width);
    }
    await evaluate(client, `window.aftTestDetail.querySelector('[data-aft-finding]').click()`);
    assert.equal(await evaluate(client, `document.querySelector('#aftNew').textContent`), 'Tambah Follow-up');
    console.log(JSON.stringify({status:'passed', hierarchy:'Audit > Finding > Follow-up > Evidence', create:true, edit:true, download:true, overdueSummary:true, expandableFindings:true, directFollowup:true, responsive:[1440,768,390]}));
  } finally {
    if (client) {
      await evaluate(client, `(async()=>{const response=await fetch('/api/audit-finding-tracker'); if(!response.ok)return; const records=await response.json(); const own=records.filter(r=>r.data.title.startsWith(${JSON.stringify(prefix)})); for(const kind of ['evidence','followup','finding','audit'])for(const row of own.filter(r=>r.kind===kind)){const result=await fetch('/api/audit-finding-tracker/'+row.id,{method:'DELETE'});if(!result.ok)throw new Error('Test cleanup failed');}})()`).catch(e=>console.error(e.message));
      client.close();
    }
    chrome.kill(); await delay(1000); await removeBrowserProfile();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
