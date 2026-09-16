// Shared transfer UI uses the existing authenticated APIs and their write permissions.
const moduleTransfer = (() => {
  const section = (key, title, url, columns, options = {}) => ({ key, title, url, columns: columns.split(' '), ...options });
  const controls = 'id function category subcategory implementation minimumEvidence applicability evidence';
  const modules = {
    csf: { title: 'NIST CSF Assessment', views: ['assessmentView', 'csfView'], sections: [section('assessment', 'Maturity assessment', '/api/assessment', 'id policyScore practiceScore score notes attachments', { assessment: true })] },
    privacy: { title: 'NIST Privacy Assessment', views: ['privacyAssessmentView', 'privacyView'], sections: [section('assessment', 'Privacy assessment', '/api/privacy/assessment', 'id policyScore practiceScore score notes attachments', { assessment: true })] },
    iso27001: { title: 'ISO 27001', views: ['iso27001View'], sections: [section('requirements', 'Requirements', '/api/frameworks/iso27001/controls', controls, { control: true }), section('soa', 'Statement of Applicability', '/api/frameworks/iso27001-soa/controls', controls, { control: true }), section('objectives', 'Information security objectives', '/api/frameworks/iso27001/objectives', 'year objective indicator baseline targetValue owner evaluationFrequency periodTargets notes')] },
    'risk-acceptance': { title: 'Risk Acceptance', views: ['riskAcceptanceView'], sections: [section('register', 'Acceptance register', '/api/risk-acceptance', 'id requestorName assetName department riskDescription benefitJustification mitigationPlan businessOwnerDecision remediationDate cisDecision cisConditions')] },
    'risk-management': { title: 'Risk Management', views: ['riskManagementView'], sections: [section('register', 'Risk register', '/api/risk-management', 'riskId riskCategory effectedAsset identificationRisk riskOwner likelihood impact riskRating treatmentAction deadline residualRating', { id: 'riskId' })] },
    'policy-register': { title: 'Policy Register', views: ['policyRegisterView'], sections: [section('register', 'Policy register', '/api/policy-register', 'id title category owner reviewCycle approvalStatus lastReview notes items')] },
    personnel: { title: 'Personnel Certification', views: ['personnelCertificationView'], sections: [section('personnel', 'Organization personnel', '/api/personnel-certifications/organization-personnel', 'id employeeId personnelName personnelRole supervisorName'), section('certifications', 'Certifications', '/api/personnel-certifications', 'personnelName employeeId certificationName issuer certificationLevel status issueDate expiryDate notes')] }
  };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const label = value => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  async function request(url, method = 'GET', body) {
    const response = await fetch(url, { method, cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async function collect(key) {
    const data = {};
    for (const item of modules[key].sections) data[item.key] = await request(item.url);
    return { format: 'nist-basis-module', version: 1, module: key, exportedAt: new Date().toISOString(), data };
  }
  function validate(key, payload) {
    if (!object(payload) || payload.format !== 'nist-basis-module' || payload.version !== 1 || payload.module !== key || !object(payload.data)) throw new Error('Format, versi, atau modul file tidak sesuai. Gunakan file Export JSON dari modul ini.');
    for (const item of modules[key].sections) {
      const value = payload.data[item.key];
      if (item.assessment) {
        if (!object(value) || !object(value.scores) || !object(value.notes)) throw new Error('Data assessment tidak valid.');
        for (const field of ['scores', 'policyScores', 'practiceScores']) {
          if (value[field] !== undefined && (!object(value[field]) || Object.values(value[field]).some(score => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 5))) throw new Error(`Nilai ${field} tidak valid (0–5).`);
        }
        if (value.attachments !== undefined && !object(value.attachments)) throw new Error('Attachments tidak valid.');
      } else if (!Array.isArray(value) || value.some(row => !object(row))) throw new Error(`${item.title}: daftar data tidak valid.`);
      else {
        const ids = value.map(row => row[item.id || 'id']).filter(id => id !== undefined && id !== null);
        if (new Set(ids.map(String)).size !== ids.length) throw new Error(`${item.title}: ID duplikat.`);
        if (item.control && value.some(row => !row.id)) throw new Error(`${item.title}: ID kontrol wajib diisi.`);
      }
    }
    if (key === 'personnel') {
      const ids = new Set(payload.data.personnel.map(row => String(row.id)));
      if (payload.data.personnel.some(row => row.id == null) || payload.data.certifications.some(row => row.personnelId == null || !ids.has(String(row.personnelId)))) throw new Error('Relasi pegawai dan sertifikasi dalam file tidak valid.');
    }
    return payload;
  }
  function rows(item, value) {
    if (!item.assessment) return value;
    const controlId = key => key.replace(/^(?:privacy-)?(?:policy|practice)-/, '');
    const ids = [...new Set(['scores', 'policyScores', 'practiceScores', 'notes', 'attachments'].flatMap(field => Object.keys(value[field] || {}).map(controlId)))];
    const related = (field, id) => Object.fromEntries(Object.entries(value[field] || {}).filter(([key]) => controlId(key) === id));
    return ids.sort().map(id => ({ id, policyScore: value.policyScores?.[id], practiceScore: value.practiceScores?.[id], score: value.scores?.[id], notes: related('notes', id), attachments: related('attachments', id) }));
  }
  function report(key, payload) {
    const config = modules[key];
    const content = config.sections.map(item => {
      const records = rows(item, payload.data[item.key]);
      const statusField = { certifications: 'status', objectives: 'owner', soa: 'applicability' }[item.key] || (key === 'risk-management' ? 'riskRating' : key === 'risk-acceptance' ? 'cisDecision' : key === 'policy-register' ? 'approvalStatus' : null);
      const summary = statusField ? Object.entries(records.reduce((out, row) => { const value = row[statusField] || 'Belum diisi'; out[value] = (out[value] || 0) + 1; return out; }, {})).map(([name, count]) => `${escape(name)}: ${count}`).join(' · ') : '';
      return `<h2>${escape(item.title)}</h2><p>Total: ${records.length}${summary ? ` · ${summary}` : ''}</p>${records.length ? `<table><thead><tr>${item.columns.map(column => `<th>${escape(label(column))}</th>`).join('')}</tr></thead><tbody>${records.map(row => `<tr>${item.columns.map(column => `<td>${escape(typeof row[column] === 'object' && row[column] !== null ? JSON.stringify(row[column], null, 2) : row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>Belum ada data.</p>'}`;
    }).join('');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Report ${escape(config.title)}</title><style>body{font:12px Arial;margin:24px;color:#172335}h1{font-size:24px}h2{margin-top:28px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #ccd3dc;padding:6px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}th{background:#edf2f7}thead{display:table-header-group}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}body{margin:0}}</style></head><body><button onclick="window.print()">Cetak / Simpan PDF</button><h1>${escape(config.title)}</h1><p>Dibuat: ${escape(payload.exportedAt)} · Seluruh data modul</p>${content}</body></html>`;
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importPayload(key, payload, progress) {
    validate(key, payload);
    let completed = 0;
    const personnelIds = new Map();
    try {
      for (const item of modules[key].sections) {
        if (item.assessment) { await request(item.url, 'PUT', payload.data[item.key]); completed++; continue; }
        const existing = await request(item.url);
        for (const original of payload.data[item.key]) {
          const row = { ...original };
          for (const field of Object.keys(row)) if (/Date$|^deadline$|^lastReview$/.test(field) && typeof row[field] === 'string') row[field] = row[field].slice(0, 10);
          if (item.control) row.minimum_evidence = row.minimumEvidence;
          if (key === 'personnel' && item.key === 'certifications') {
            if (!personnelIds.has(String(row.personnelId))) throw new Error(`Pegawai ${row.personnelId} tidak terdapat dalam file.`);
            row.personnelId = personnelIds.get(String(row.personnelId));
          }
          const idField = item.id || 'id';
          const match = existing.find(record => row[idField] != null && String(record[idField]) === String(row[idField]));
          const saved = await request(match ? `${item.url}/${encodeURIComponent(match[idField])}` : item.url, match ? 'PUT' : 'POST', row);
          if (key === 'personnel' && item.key === 'personnel') personnelIds.set(String(original.id), saved.id);
          completed++; progress?.(completed);
        }
      }
      return completed;
    } catch (error) { throw new Error(`${completed} data sudah tersimpan; import dihentikan. ${error.message}`); }
  }
  function preview(key, payload, status) {
    const dialog = document.createElement('dialog');
    const count = modules[key].sections.map(item => `${item.title}: ${item.assessment ? 1 : payload.data[item.key].length}`).join(' · ');
    dialog.innerHTML = `<h2>Import ${escape(modules[key].title)}</h2><p>${escape(count)}</p><p>ID yang sama diperbarui, data baru ditambahkan. Assessment diganti dengan isi file. File evidence tidak disertakan; referensinya memerlukan file yang sudah tersedia di server. Gunakan file dari instalasi yang sama agar ID tetap cocok.</p><p>Jika ada kegagalan, data yang sudah tersimpan tetap tersimpan. Detail hasil akan ditampilkan.</p><button type="button" data-confirm>Import sekarang</button> <button type="button" data-cancel>Batal</button><p role="status"></p>`;
    document.body.append(dialog);
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('[data-confirm]').onclick = async () => {
      const buttons = dialog.querySelectorAll('button'); buttons.forEach(button => { button.disabled = true; });
      const message = dialog.querySelector('[role="status"]');
      const blockClose = event => event.preventDefault(); dialog.addEventListener('cancel', blockClose);
      try {
        const count = await importPayload(key, payload, count => { message.textContent = `${count} data tersimpan…`; });
        status.textContent = `${count} data berhasil diimport.`;
        window.location.reload();
      } catch (error) { message.textContent = error.message; status.textContent = error.message; }
      finally { dialog.removeEventListener('cancel', blockClose); dialog.querySelector('[data-cancel]').disabled = false; }
    };
    dialog.showModal();
  }
  function mount() {
    for (const [key, config] of Object.entries(modules)) for (const viewId of config.views) {
      const view = document.getElementById(viewId);
      if (!view || view.querySelector('[data-module-transfer]')) continue;
      const toolbar = document.createElement('div'); toolbar.dataset.moduleTransfer = key;
      toolbar.className = 'module-transfer-toolbar';
      toolbar.innerHTML = '<button type="button" data-import>Import JSON</button><button type="button" data-export>Export JSON</button><button type="button" data-report>Report / PDF</button><input type="file" accept=".json,application/json" hidden><span role="status" aria-live="polite"></span>';
      const status = toolbar.querySelector('[role="status"]');
      const input = toolbar.querySelector('input');
      toolbar.querySelector('[data-import]').onclick = () => { input.value = ''; input.click(); };
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        try { if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran file maksimal 10 MB.'); preview(key, validate(key, JSON.parse(await file.text())), status); }
        catch (error) { status.textContent = error.message; }
      };
      for (const action of ['export', 'report']) toolbar.querySelector(`[data-${action}]`).onclick = async event => {
        const button = event.currentTarget; button.disabled = true; status.textContent = 'Mengambil data…';
        try { const payload = await collect(key); download(`${key}-${new Date().toISOString().slice(0, 10)}.${action === 'export' ? 'json' : 'html'}`, action === 'export' ? JSON.stringify(payload, null, 2) : report(key, payload), action === 'export' ? 'application/json' : 'text/html'); status.textContent = action === 'export' ? 'Export selesai.' : 'Buka file report HTML untuk mencetak / menyimpan PDF.'; }
        catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
      };
      view.prepend(toolbar);
    }
  }
  return { modules, validate, rows, report, collect, importPayload, mount };
})();
moduleTransfer.mount();
// Personnel's section is created lazily by its navigation handler.
document.querySelector('[data-view="personnel-certification"]')?.addEventListener('click', () => moduleTransfer.mount());
