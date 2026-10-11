// Classic-script fragment: use actual register fields and the existing review calculation.
let pdDrill = null;
function pdNext(row) { return getPolicyNextReviewDate(row) || ''; }
function pdMatches(row, kind, value) {
  if (kind === 'record') return String(row.id) === value;
  if (kind === 'all') return true;
  if (kind === 'approved') return String(row.approvalStatus || '').toLowerCase() === 'approved';
  if (kind === 'soon' || kind === 'overdue') return gdReviewMatches(pdNext(row), kind);
  if (kind === 'missing') return !pdNext(row) && getPolicyReviewCycleMonths(row.reviewCycle) !== 0;
  if (kind === 'attachment') return Boolean(row.attachmentName && row.attachmentPath);
  if (kind === 'date') return pdNext(row) === value;
  if (kind === 'month') return pdNext(row).slice(0, 7) === value;
  return String(row[{ category: 'category', owner: 'owner', status: 'approvalStatus', cycle: 'reviewCycle' }[kind]] || '') === value;
}
function pdGlobalRows() {
  return policyRegisterRows.filter(row => (!$('pdCategory').value || row.category === $('pdCategory').value) &&
    (!$('pdOwner').value || row.owner === $('pdOwner').value) && (!$('pdStatus').value || row.approvalStatus === $('pdStatus').value) &&
    (!$('pdReview').value || pdMatches(row, $('pdReview').value)));
}
function pdVisibleRows() {
  const category = $('policyRegisterCategoryFilter').value, owner = $('policyRegisterOwnerFilter').value, status = $('policyRegisterStatusFilter').value;
  const search = $('policyRegisterSearch').value.trim().toLowerCase();
  return pdGlobalRows().filter(row => (!pdDrill || pdMatches(row, pdDrill.kind, pdDrill.value)) &&
    (!category || category === 'all' || row.category === category) && (!owner || owner === 'all' || row.owner === owner) &&
    (!status || status === 'all' || row.approvalStatus === status) && (!search || policySearchText(row).includes(search)));
}
function pdClearLocal() { $('policyRegisterSearch').value = ''; ['Category', 'Owner', 'Status'].forEach(field => { $('policyRegister' + field + 'Filter').value = 'all'; }); }
function pdReset() { ['Category', 'Owner', 'Status', 'Review'].forEach(field => { $('pd' + field).value = ''; }); pdDrill = null; pdClearLocal(); renderPolicyDashboard(); filterPolicyRegisterTable(); }
function pdSetDrill(kind, value, label) {
  pdDrill = { kind, value, label }; pdClearLocal(); filterPolicyRegisterTable();
  document.querySelector('[data-policy-tab="register"]').click(); document.querySelector('[data-policy-tab="register"]').focus(); $('policyRegisterPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function pdRenderContext() {
  const selected = ['Category', 'Owner', 'Status', 'Review'].map(field => $('pd' + field).selectedOptions[0]?.textContent).join(' · ');
  $('pdDrillStatus').textContent = `${pdVisibleRows().length} dari ${policyRegisterRows.length} kebijakan · ${pdDrill ? 'Drill-down: ' + pdDrill.label + ' · ' : ''}${selected}`;
  $('pdClearDrill').disabled = !pdDrill;
}
function renderPolicyDashboard() {
  gdOptions('pdCategory', policyRegisterRows.map(row => row.category), 'Semua kategori');
  gdOptions('pdOwner', policyRegisterRows.map(row => row.owner), 'Semua owner');
  gdOptions('pdStatus', policyRegisterRows.map(row => row.approvalStatus), 'Semua status');
  const rows = pdGlobalRows(), count = kind => rows.filter(row => pdMatches(row, kind)).length;
  gdKpis('pdKpis', [
    ['all', 'Total policies', rows.length, 'Kebijakan dalam cakupan', 'policyRegisterTotalValue'],
    ['approved', 'Approved', count('approved'), 'Sesuai status persetujuan yang diinput', 'policyRegisterApprovedValue'],
    ['soon', 'Review within 30 days', count('soon'), 'Hari ini hingga H-30', 'policyRegisterDueValue'],
    ['overdue', 'Overdue review', count('overdue'), 'Tanggal review berikutnya sudah terlewat'],
    ['missing', 'Jadwal belum lengkap', count('missing'), 'Tanpa tanggal atau siklus berkala yang dikenali'],
    ['attachment', 'Dengan lampiran', count('attachment'), `${new Set(rows.map(row => row.owner).filter(Boolean)).size} owner · dokumen terlampir`]
  ], 'pd-kpi');
  $('policyRegisterCount').textContent = `${policyRegisterRows.length} policies`;
  $('pdFilterStatus').textContent = `${rows.length} dari ${policyRegisterRows.length} kebijakan · berdasarkan data register terkini.`;
  gdBars('pdStatuses', rows, row => row.approvalStatus, 'pd-status');
  gdBars('pdCategories', rows, row => row.category, 'pd-category');
  gdBars('pdOwners', rows, row => row.owner, 'pd-owner');
  gdBars('pdCycles', rows, row => row.reviewCycle, 'pd-cycle');
  gdTimeline('pdTimeline', rows, pdNext, 'pd-month');
  gdCalendar('pdCalendar', 'pdMonth', rows, pdNext, 'pd-date');
  const alerts = rows.filter(row => pdMatches(row, 'overdue') || pdMatches(row, 'soon') || pdMatches(row, 'missing'));
  alerts.sort((a, b) => (pdNext(a) || '9999').localeCompare(pdNext(b) || '9999'));
  $('pdAlertCount').textContent = alerts.length;
  $('pdAlerts').innerHTML = '<h3>Review perlu perhatian</h3>' + (alerts.map(row => `<button type="button" class="rd-alert" data-pd-record="${escapeHtml(String(row.id))}"><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.owner || 'Owner belum diisi')} · ${pdNext(row) || 'Jadwal belum lengkap'} · ${pdMatches(row, 'overdue') ? 'Overdue' : pdMatches(row, 'soon') ? 'Dalam 30 hari' : 'Perlu melengkapi input'}</small></button>`).join('') || '<p class="muted">Tidak ada kebijakan yang membutuhkan perhatian dalam cakupan.</p>');
  pdRenderContext();
}
$('policyRegisterView').addEventListener('change', event => {
  if (['pdCategory', 'pdOwner', 'pdStatus', 'pdReview'].includes(event.target.id)) { pdDrill = null; renderPolicyDashboard(); filterPolicyRegisterTable(); }
  if (event.target.id === 'pdMonth') gdCalendar('pdCalendar', 'pdMonth', pdGlobalRows(), pdNext, 'pd-date');
  if (event.target.id === 'pdExport' && event.target.value) {
    gdExport('policy-dashboard', pdVisibleRows(), [['ID', r => r.id], ['Title', r => r.title], ['Category', r => r.category], ['Owner', r => r.owner], ['Status', r => r.approvalStatus], ['Review cycle', r => r.reviewCycle], ['Last review', r => r.lastReview], ['Next review', pdNext], ['Attachment', r => r.attachmentName]], event.target.value); event.target.value = '';
  }
});
$('policyRegisterView').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.id === 'pdRefresh') { button.disabled = true; loadPolicyRegisterRows().catch(error => { $('pdFilterStatus').textContent = error.message; }).finally(() => { button.disabled = false; }); }
  if (button.id === 'pdReset' || button.id === 'pdListReset') pdReset();
  if (button.id === 'pdBackDashboard') document.querySelector('[data-policy-tab="dashboard"]').click();
  if (button.id === 'pdClearDrill') { pdDrill = null; filterPolicyRegisterTable(); }
  if (button.id === 'pdAlertsButton') { $('pdAlerts').hidden = !$('pdAlerts').hidden; button.setAttribute('aria-expanded', String(!$('pdAlerts').hidden)); }
  if (button.dataset.pdKpi) pdSetDrill(button.dataset.pdKpi, '', button.querySelector('.stat-label').textContent);
  for (const kind of ['category', 'owner', 'status', 'cycle', 'month', 'date']) { const value = button.dataset['pd' + kind[0].toUpperCase() + kind.slice(1)]; if (value !== undefined) pdSetDrill(kind, value, `${kind}: ${value || 'Belum diisi'}`); }
  if (button.dataset.pdRecord) { const row = policyRegisterRows.find(row => String(row.id) === button.dataset.pdRecord); if (row) pdSetRecord(row); }
});
function pdSetRecord(row) {
  pdDrill = { kind: 'record', value: String(row.id), label: row.title }; pdClearLocal(); filterPolicyRegisterTable(); document.querySelector('[data-policy-tab="register"]').click(); document.querySelector('[data-policy-tab="register"]').focus();
}
