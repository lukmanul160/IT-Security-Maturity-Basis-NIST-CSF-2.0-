// Classic-script fragment. No approval, expiry, or financial data is fabricated.
const raDashboardState = { drill: null, page: 1, auditId: '', auditPage: 1, auditGeneration: 0 };
function raToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function raDate(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(text + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function raDays(date, today = raToday()) { return date ? Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null; }
function raSigned(form, stage) {
  const name = stage === 'requestor' ? form.requestorPrintName || form.requestorName : form[stage + 'Name'];
  return Boolean(String(name || '').trim() && String(form[stage + 'Signature'] || '').trim() && raDate(form[stage + 'Date']));
}
function raModel(form, today = raToday()) {
  const stages = ['requestor', 'cio', 'cis'].map(stage => raSigned(form, stage));
  const rejected = form.businessOwnerDecision === 'denied' || form.cisDecision === 'denied';
  const complete = stages.every(Boolean) && ['temporary', 'one_year'].includes(form.businessOwnerDecision) && ['approved', 'conditional'].includes(form.cisDecision);
  const status = rejected ? 'rejected' : !complete ? 'pending' : form.cisDecision === 'conditional' ? 'conditional' : 'approved';
  const date = raDate(form.remediationDate), days = raDays(date, today), accepted = !rejected && complete;
  return { status, stages, accepted, date, days, active: accepted && days !== null && days >= 0, soon: accepted && days !== null && days >= 0 && days <= 30, overdue: accepted && days !== null && days < 0, missing: !rejected && !date };
}
const raStatusLabels = { pending: 'Pending / pengesahan belum lengkap', approved: 'Approved', conditional: 'Approved with conditions', rejected: 'Rejected' };
function raRequestId(form) { return `RAF-${String(form.id).padStart(5, '0')}`; }
function raGlobalRows() {
  return riskAcceptanceForms.filter(form => {
    const model = raModel(form), review = $('raReview').value;
    return (!$('raStatus').value || model.status === $('raStatus').value) && (!$('raAsset').value || form.assetName === $('raAsset').value) &&
      (!$('raDepartment').value || form.department === $('raDepartment').value) && (!review || review === 'soon' && model.soon || review === 'overdue' && model.overdue || review === 'missing' && model.missing);
  });
}
function raMatchesDrill(form) {
  const drill = raDashboardState.drill, model = raModel(form);
  if (!drill) return true;
  if (['active', 'soon', 'overdue', 'missing'].includes(drill.kind)) return model[drill.kind];
  if (drill.kind === 'pending') return model.status === 'pending';
  if (drill.kind === 'department') return (form.department || 'Belum ditetapkan') === drill.value;
  if (drill.kind === 'asset') return (form.assetName || 'Belum ditetapkan') === drill.value;
  if (drill.kind === 'date') return model.status !== 'rejected' && model.date === drill.value;
  if (drill.kind === 'stage') return !model.stages[Number(drill.value)] && model.status !== 'rejected';
  return true;
}
function raTableRows() { const query = $('raSearch').value.trim().toLowerCase(); return raGlobalRows().filter(form => raMatchesDrill(form) && (!query || `${raRequestId(form)} ${Object.values(form).join(' ')}`.toLowerCase().includes(query))); }
function raPopulateFilters() {
  for (const [id, field, label] of [['raAsset', 'assetName', 'Semua aset'], ['raDepartment', 'department', 'Semua departemen']]) {
    const element = $(id), selected = element.value;
    element.innerHTML = `<option value="">${label}</option>` + [...new Set(riskAcceptanceForms.map(form => form[field]).filter(Boolean))].sort().map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    element.value = selected; if (element.selectedIndex < 0) element.value = '';
  }
}
function raSetDrill(drill) { raDashboardState.drill = drill; raDashboardState.page = 1; $('raSearch').value = ''; renderRiskAcceptanceDashboard(); selectRiskAcceptanceTab('list'); $('riskAcceptanceBody').closest('article').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function raBadge(model) { return `<span class="ra-badge ra-${model.status}">${raStatusLabels[model.status]}</span>`; }
function raReviewText(model) { return !model.date ? 'Tanggal remediasi belum diisi' : `${model.date} · ${model.days < 0 ? Math.abs(model.days) + ' hari terlewat' : model.days === 0 ? 'Hari ini' : model.days + ' hari lagi'}`; }
function raRenderCalendar(rows) {
  const month = $('raMonth').value;
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12 || Number(month.slice(0, 4)) < 100) { $('raCalendar').innerHTML = ''; $('raCalendarStatus').textContent = 'Pilih bulan kalender yang valid.'; return; }
  const first = new Date(`${month}-01T00:00:00Z`), count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const dates = new Map(); rows.forEach(form => { const model = raModel(form); if (model.status !== 'rejected' && model.date.startsWith(month)) dates.set(model.date, (dates.get(model.date) || 0) + 1); });
  $('raCalendar').innerHTML = '<span class="ra-calendar-empty"></span>'.repeat(first.getUTCDay()) + Array.from({ length: count }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`, n = dates.get(date) || 0, days = raDays(date);
    const selected = raDashboardState.drill?.kind === 'date' && raDashboardState.drill.value === date;
    return `<button type="button" class="ra-calendar-day ${n ? days < 0 ? 'ra-day-overdue' : days <= 30 ? 'ra-day-soon' : 'ra-day-scheduled' : ''}" data-ra-date="${date}" ${!n ? 'disabled' : ''} aria-pressed="${Boolean(selected)}" aria-label="${date}, ${n} pengajuan dengan jadwal remediasi"><strong>${i + 1}</strong>${n ? `<small>${n} review</small>` : ''}</button>`;
  }).join('');
  const scheduled = rows.filter(form => { const model = raModel(form); return model.status !== 'rejected' && model.date.startsWith(month); }).length;
  $('raCalendarStatus').textContent = `${scheduled} jadwal pada ${month} · ${rows.filter(form => raModel(form).missing).length} pengajuan tanpa tanggal remediasi.`;
}
function renderRiskAcceptanceDashboard() {
  if (!$('raKpis')) return;
  raPopulateFilters(); if (!$('raMonth').value) $('raMonth').value = raToday().slice(0, 7);
  const rows = raGlobalRows(), models = rows.map(form => raModel(form));
  const metrics = [
    ['active', 'Active accepted requests', models.filter(model => model.active).length, 'Pengesahan lengkap · tanggal review belum lewat'],
    ['soon', 'Review within 30 days', models.filter(model => model.soon).length, 'Pengajuan disetujui · H-30 hingga hari ini'],
    ['pending', 'Pending approvals', models.filter(model => model.status === 'pending').length, 'Keputusan / input pengesahan belum lengkap'],
    ['overdue', 'Overdue for review', models.filter(model => model.overdue).length, 'Pengajuan disetujui · tanggal remediasi terlewat'],
    ['missing', 'Tanpa tanggal review', models.filter(model => model.missing).length, 'Pengajuan tidak ditolak · perlu melengkapi tanggal'],
    ['financial', 'Accepted financial exposure', 'Belum tersedia', 'Nilai finansial belum menjadi input formulir']
  ];
  $('raKpis').innerHTML = metrics.map(([kind, label, value, detail]) => `<button type="button" class="stat-panel rd-kpi ${kind === 'financial' ? 'ra-unavailable' : ''}" data-ra-kpi="${kind}"><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail}</span></button>`).join('');
  $('raFilterStatus').textContent = `${rows.length} dari ${riskAcceptanceForms.length} pengajuan · status sesuai input formulir, bukan validasi kewenangan penandatangan.`;
  raRenderCalendar(rows);
  const groups = (field, kind, stacked = false) => {
    const grouped = new Map(); rows.forEach(form => { const key = form[field] || 'Belum ditetapkan'; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(form); });
    return [...grouped].sort((a, b) => b[1].length - a[1].length).map(([label, forms]) => {
      const states = ['approved', 'conditional', 'pending', 'rejected'].map(status => [status, forms.filter(form => raModel(form).status === status).length]);
      return `<button type="button" class="rd-bar" data-ra-${kind}="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${forms.length}</strong>${stacked ? `<i class="ra-stacked" aria-label="${states.map(([status, n]) => `${raStatusLabels[status]} ${n}`).join(', ')}">${states.map(([status, n]) => `<b class="ra-${status}" style="width:${n / forms.length * 100}%" title="${raStatusLabels[status]}: ${n}"></b>`).join('')}</i>` : `<i><b style="width:${forms.length / Math.max(1, rows.length) * 100}%"></b></i>`}</button>`;
    }).join('') || '<p class="muted">Tidak ada pengajuan dalam cakupan.</p>';
  };
  $('raDepartments').innerHTML = groups('department', 'department', true); $('raAssets').innerHTML = groups('assetName', 'asset');
  const stageNames = ['Pengesahan pemohon', 'CIO acknowledgement', 'CIS final review'];
  $('raWorkflow').innerHTML = stageNames.map((label, index) => {
    const complete = models.filter(model => model.stages[index]).length, pending = models.filter(model => !model.stages[index] && model.status !== 'rejected').length;
    return `<button type="button" class="rd-indicator" data-ra-stage="${index}"><span>${index + 1}. ${label}</span><strong>${complete}/${rows.length}</strong><progress max="${Math.max(1, rows.length)}" value="${complete}" aria-label="${label}: ${complete} dari ${rows.length} lengkap"></progress><small>${pending} pengajuan belum lengkap · klik untuk meninjau</small></button>`;
  }).join('');
  $('raCoverage').innerHTML = [['Pengajuan diterima sebelumnya', rows.filter(form => form.previouslyAccepted).length], ['Keputusan CIS bersyarat', rows.filter(form => form.cisDecision === 'conditional').length], ['Justifikasi tercatat', rows.filter(form => String(form.benefitJustification || '').trim()).length], ['Rencana mitigasi tercatat', rows.filter(form => String(form.mitigationPlan || '').trim()).length]].map(([label, count]) => `<div class="ra-coverage-item"><span>${label}</span><strong>${count}</strong></div>`).join('');
  const alerts = rows.filter(form => { const model = raModel(form); return model.soon || model.overdue; }).sort((a, b) => raModel(a).days - raModel(b).days);
  $('raAlertCount').textContent = alerts.length;
  $('raAlerts').innerHTML = '<h3>Pengingat review pada dashboard</h3><p class="muted">Pengingat lokal untuk pengajuan disetujui: H-30, H-14, H-7, atau overdue. Email/Slack/Teams belum dikonfigurasi untuk Risk Acceptance.</p>' + (alerts.map(form => {
    const model = raModel(form), horizon = model.days < 0 ? 'Overdue' : model.days <= 7 ? 'H-7' : model.days <= 14 ? 'H-14' : 'H-30';
    return `<button type="button" class="rd-alert" data-ra-view="${escapeHtml(String(form.id))}"><span class="ra-badge ${model.overdue ? 'ra-rejected' : 'ra-conditional'}">${horizon}</span> <strong>${escapeHtml(raRequestId(form))}</strong> · ${escapeHtml(form.assetName)}<small>${escapeHtml(raReviewText(model))} · ${escapeHtml(form.requestorName)} / ${escapeHtml(form.department)}</small></button>`;
  }).join('') || '<p class="muted">Tidak ada review mendekat atau overdue dalam cakupan.</p>');
  const visible = raTableRows(), pageCount = Math.max(1, Math.ceil(visible.length / 20)); raDashboardState.page = Math.max(1, Math.min(pageCount, raDashboardState.page));
  $('raResultCount').textContent = `(${visible.length})`;
  $('raDrillStatus').textContent = raDashboardState.drill ? `Drill-down: ${raDashboardState.drill.label}` : `Daftar mengikuti filter dashboard: status ${$('raStatus').selectedOptions[0].textContent}, aset ${$('raAsset').selectedOptions[0].textContent}, departemen ${$('raDepartment').selectedOptions[0].textContent}, review ${$('raReview').selectedOptions[0].textContent}.`;
  $('raClearDrill').disabled = !raDashboardState.drill;
  $('riskAcceptanceBody').innerHTML = visible.slice((raDashboardState.page - 1) * 20, raDashboardState.page * 20).map(form => {
    const model = raModel(form), id = escapeHtml(String(form.id));
    return `<tr><td><button type="button" class="attachment-action-button" data-ra-view="${id}">${escapeHtml(raRequestId(form))}</button><p>${escapeHtml(form.riskDescription || '—')}</p></td><td>${escapeHtml(form.assetName || '—')}</td><td><div class="ra-text-preview">${escapeHtml(form.mitigationPlan || '—')}</div></td><td>${escapeHtml(form.requestorName || '—')}<small>${escapeHtml(form.department || '—')}</small></td><td>${stageNames.map((label, index) => `<small class="${model.stages[index] ? 'ra-complete-text' : ''}">${label}: ${model.stages[index] ? 'Lengkap' : 'Belum lengkap'}</small>`).join('')}<small>CIO: ${escapeHtml(form.cioName || '—')}<br>CIS: ${escapeHtml(form.cisName || '—')}</small></td><td class="${model.overdue ? 'ra-overdue-text' : ''}">${escapeHtml(raReviewText(model))}</td><td>${raBadge(model)}${model.overdue ? '<small class="ra-overdue-text">Overdue review</small>' : model.soon ? '<small>Review segera</small>' : model.missing ? '<small>Jadwal belum diisi</small>' : ''}</td><td><div class="ra-row-actions"><button type="button" class="attachment-action-button" data-ra-view="${id}">Detail</button><button type="button" class="attachment-action-button" data-ra-pdf="${id}">PDF form</button>${canPerform('risk-acceptance', 'update') ? `<button type="button" class="attachment-action-button" data-ra-edit="${id}">Edit / review</button>` : ''}${currentUserRole === 'admin' ? `<button type="button" class="attachment-action-button" data-ra-audit="${id}">Audit log</button>` : ''}${canPerform('risk-acceptance', 'delete') ? `<button type="button" class="attachment-action-button danger" data-risk-delete="${id}">Delete</button>` : ''}</div></td></tr>`;
  }).join('') || '<tr><td colspan="8">Tidak ada pengajuan yang cocok.</td></tr>';
  $('raPagination').innerHTML = pageCount > 1 ? `<button type="button" data-ra-page="${raDashboardState.page - 1}" ${raDashboardState.page === 1 ? 'disabled' : ''}>Previous</button><span>${raDashboardState.page} / ${pageCount}</span><button type="button" data-ra-page="${raDashboardState.page + 1}" ${raDashboardState.page === pageCount ? 'disabled' : ''}>Next</button>` : '';
}
async function raLoadAudit() {
  const id = raDashboardState.auditId, page = raDashboardState.auditPage, generation = ++raDashboardState.auditGeneration;
  $('raAuditBody').textContent = 'Memuat audit aktivitas...'; $('raAuditPagination').innerHTML = '';
  try {
    const response = await fetch(`/api/risk-acceptance/${encodeURIComponent(id)}/audit?offset=${(page - 1) * 20}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Audit log tidak dapat dimuat. Akses hanya tersedia untuk Admin.');
    const rows = await response.json(); if (generation !== raDashboardState.auditGeneration) return;
    $('raAuditBody').innerHTML = rows.map(row => `<article class="ra-audit-entry"><strong>${escapeHtml(new Date(row.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Bangkok' }))}</strong><p>${escapeHtml(row.actorUsername || '—')} · ${escapeHtml(row.eventType)} · HTTP ${escapeHtml(String(row.statusCode))}</p><small>IP: ${escapeHtml(row.ipAddress || '—')} · Request ID: ${escapeHtml(row.requestId || '')}</small><details><summary>Detail aktivitas</summary><pre>${escapeHtml(JSON.stringify(row.details || {}, null, 2))}</pre></details></article>`).join('') || '<p class="muted">Belum ada log untuk pengajuan ini. Aktivitas sebelum Audit Trail diaktifkan mungkin tidak tersedia.</p>';
    $('raAuditPagination').innerHTML = `<button type="button" data-ra-audit-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Halaman ${page}</span><button type="button" data-ra-audit-page="${page + 1}" ${rows.length < 20 ? 'disabled' : ''}>Next</button>`;
  } catch (error) { if (generation === raDashboardState.auditGeneration) $('raAuditBody').textContent = error.message; }
}
const raDashboardPanel = $('riskAcceptanceDashboardPanel');
raDashboardPanel.addEventListener('change', event => {
  if (event.target.id === 'raMonth') { raRenderCalendar(raGlobalRows()); return; }
  if (['raStatus', 'raAsset', 'raDepartment', 'raReview'].includes(event.target.id)) { raDashboardState.page = 1; raDashboardState.drill = null; renderRiskAcceptanceDashboard(); }
});
$('raSearch').addEventListener('input', () => { raDashboardState.page = 1; renderRiskAcceptanceDashboard(); });
$('riskAcceptanceView').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'raRefresh') { button.disabled = true; loadRiskAcceptanceForms().catch(error => { $('raFilterStatus').textContent = error.message; }).finally(() => { button.disabled = false; }); }
  if (button.id === 'raBackDashboard') selectRiskAcceptanceTab('dashboard');
  if (button.id === 'raReset' || button.id === 'raListReset') { ['raStatus', 'raAsset', 'raDepartment', 'raReview', 'raSearch'].forEach(id => { $(id).value = ''; }); raDashboardState.page = 1; raDashboardState.drill = null; renderRiskAcceptanceDashboard(); }
  if (button.id === 'raClearDrill') { raDashboardState.page = 1; raDashboardState.drill = null; renderRiskAcceptanceDashboard(); }
  if (button.id === 'raAlertsButton') { $('raAlerts').hidden = !$('raAlerts').hidden; button.setAttribute('aria-expanded', String(!$('raAlerts').hidden)); }
  if (button.id === 'raAuditClose') { ++raDashboardState.auditGeneration; $('raAuditDialog').close(); }
  if (button.dataset.raKpi === 'financial') $('raCoverage').closest('article').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (button.dataset.raKpi) raSetDrill({ kind: button.dataset.raKpi, label: button.querySelector('.stat-label').textContent });
  for (const kind of ['department', 'asset', 'date', 'stage']) { const value = button.dataset['ra' + kind[0].toUpperCase() + kind.slice(1)]; if (value !== undefined) raSetDrill({ kind, value, label: kind === 'stage' ? ['Pengesahan pemohon belum lengkap', 'CIO acknowledgement belum lengkap', 'CIS review belum lengkap'][Number(value)] : value }); }
  if (button.dataset.raPage) { raDashboardState.page = Number(button.dataset.raPage); renderRiskAcceptanceDashboard(); }
  if (button.dataset.raView || button.dataset.raEdit) { const form = riskAcceptanceForms.find(row => String(row.id) === (button.dataset.raView || button.dataset.raEdit)); if (form) { if (button.dataset.raEdit && canPerform('risk-acceptance', 'update')) fillRiskAcceptanceForm(form); else viewRiskAcceptanceForm(form); } }
  if (button.dataset.raPdf) window.open(`/api/risk-acceptance/${encodeURIComponent(button.dataset.raPdf)}/export/pdf`, '_blank', 'noopener');
  if (button.dataset.raAudit && currentUserRole === 'admin') { raDashboardState.auditId = button.dataset.raAudit; raDashboardState.auditPage = 1; $('raAuditTitle').textContent = `Audit aktivitas · RAF-${button.dataset.raAudit.padStart(5, '0')}`; if (!$('raAuditDialog').open) $('raAuditDialog').showModal(); raLoadAudit(); }
  if (button.dataset.raAuditPage) { raDashboardState.auditPage = Number(button.dataset.raAuditPage); raLoadAudit(); }
});
$('raAuditDialog').addEventListener('close', () => { ++raDashboardState.auditGeneration; });
