// Shared classic-script scope; all dashboard values derive from the existing register.
const rdState = { drill: null };
function rdToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function rdDate(value) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function rdActive(row) { return row.treatmentAction !== 'Closed'; }
function rdScore(row, mode = 'inherent') { const l = Number(row[mode === 'residual' ? 'residualLikelihood' : 'likelihood']); const i = Number(row[mode === 'residual' ? 'residualImpact' : 'impact']); return [l, i].every(n => Number.isInteger(n) && n >= 1 && n <= 5) ? l * i : null; }
function rdHigh(row, mode = 'inherent') { return rdScore(row, mode) >= 15; }
function rdOverdue(row) { return rdActive(row) && row.deadline && String(row.deadline).slice(0, 10) < rdToday(); }
function rdBaseRows() {
  const period = $('rdPeriod').value, today = rdToday();
  let start = '', end = today;
  if (period === 'monthly') start = today.slice(0, 7) + '-01';
  if (period === 'quarterly') start = today.slice(0, 4) + '-' + String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
  if (period === 'ytd') start = today.slice(0, 4) + '-01-01';
  if (period === 'custom') { start = $('rdStart').value; end = $('rdEnd').value; }
  if (start && end && start > end) return [];
  return riskManagementRows.filter(row => {
    const date = rdDate(row.createdAt), scope = $('rdScope').value;
    return (!scope || row.effectedAsset === scope.slice(2) && scope.startsWith('a:') || row.deviceName === scope.slice(2) && scope.startsWith('d:')) &&
      (!$('rdCategory').value || row.riskCategory === $('rdCategory').value) &&
      (!$('rdOwner').value || row.riskOwner === $('rdOwner').value) &&
      (period === 'all' || date && (!start || date >= start) && (!end || date <= end));
  });
}
function rdMatchesDrill(row) {
  const d = rdState.drill;
  if (!d) return true;
  if (d.kind === 'active') return rdActive(row);
  if (d.kind === 'high') return rdActive(row) && rdHigh(row);
  if (d.kind === 'residual') return rdActive(row) && rdHigh(row, 'residual');
  if (d.kind === 'overdue') return rdOverdue(row);
  if (d.kind === 'paired') return rdScore(row) !== null && rdScore(row, 'residual') !== null;
  if (d.kind === 'category') return (row.riskCategory || 'Belum ditetapkan') === d.value;
  if (d.kind === 'owner') return rdActive(row) && rdHigh(row) && (row.riskOwner || 'Belum ditetapkan') === d.value;
  if (d.kind === 'month') return rdHigh(row) && rdDate(row.createdAt).slice(0, 7) === d.value;
  if (d.kind === 'matrix') return Number(row[d.mode === 'residual' ? 'residualLikelihood' : 'likelihood']) === d.l && Number(row[d.mode === 'residual' ? 'residualImpact' : 'impact']) === d.i;
  return true;
}
function rdVisibleRows() {
  const query = $('riskRegisterSearch').value.trim().toLowerCase();
  const category = $('riskRegisterCategoryFilter').value;
  const rating = $('riskRegisterRatingFilter').value;
  const treatment = $('riskRegisterTreatmentFilter').value;
  return rdBaseRows().filter(row => rdMatchesDrill(row) &&
    (category === 'all' || row.riskCategory === category) &&
    (rating === 'all' || row.riskRating === rating) &&
    (treatment === 'all' || row.treatmentAction === treatment) &&
    (!query || Object.values(row).join(' ').toLowerCase().includes(query)));
}
function rdClearRegisterFilters() {
  $('riskRegisterSearch').value = '';
  ['riskRegisterCategoryFilter', 'riskRegisterRatingFilter', 'riskRegisterTreatmentFilter'].forEach(id => { $(id).value = 'all'; });
  riskRegisterPage = 1;
}
function rdResetFilters() {
  ['rdScope', 'rdCategory', 'rdOwner', 'rdStart', 'rdEnd'].forEach(id => { $(id).value = ''; });
  $('rdPeriod').value = 'all'; $('rdStartLabel').hidden = $('rdEndLabel').hidden = true;
  rdState.drill = null; rdClearRegisterFilters(); renderRiskDashboard();
}
function rdSetDrill(drill) {
  rdState.drill = drill; rdClearRegisterFilters(); renderRiskDashboard();
  setRiskManagementTab('register'); $('riskRegisterPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function rdRenderRegisterContext(count) {
  const context = [];
  if ($('rdScope').value) context.push('Cakupan: ' + $('rdScope').selectedOptions[0].textContent);
  if ($('rdCategory').value) context.push('Kategori: ' + $('rdCategory').value);
  if ($('rdOwner').value) context.push('Owner: ' + $('rdOwner').value);
  if ($('rdPeriod').value !== 'all') context.push('Periode: ' + ($('rdPeriod').value === 'custom' ? `${$('rdStart').value || 'Awal'} - ${$('rdEnd').value || 'Akhir'}` : $('rdPeriod').selectedOptions[0].textContent));
  if (rdState.drill) context.push('Drill-down: ' + rdState.drill.label);
  $('rdDrillStatus').textContent = context.length ? context.join(' | ') : 'Semua risiko. Klik KPI, grafik, atau matriks pada dashboard untuk membuka daftar yang sesuai.';
  $('rdClearDrill').disabled = !rdState.drill;
  $('rdResultCount').textContent = `(${count})`;
}
function rdPopulateFilters() {
  for (const [id, field, label] of [['rdCategory', 'riskCategory', 'Semua kategori'], ['rdOwner', 'riskOwner', 'Semua owner']]) {
    const element = $(id), value = element.value;
    element.innerHTML = `<option value="">${label}</option>` + [...new Set(riskManagementRows.map(r => r[field]).filter(Boolean))].sort().map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    element.value = value; if (element.selectedIndex < 0) element.value = '';
  }
  const element = $('rdScope'), value = element.value;
  element.innerHTML = '<option value="">Semua aset / perangkat</option>' + [['a:', 'effectedAsset', 'Aset'], ['d:', 'deviceName', 'Perangkat']].map(([prefix, field, label]) => `<optgroup label="${label}">${[...new Set(riskManagementRows.map(r => r[field]).filter(Boolean))].sort().map(v => `<option value="${escapeHtml(prefix + v)}">${escapeHtml(v)}</option>`).join('')}</optgroup>`).join('');
  element.value = value; if (element.selectedIndex < 0) element.value = '';
}
function rdBadge(row, mode) { const score = rdScore(row, mode); return score === null ? '<span class="muted">Belum dinilai</span>' : `<span class="risk-rating ${score <= 4 ? 'low' : score <= 12 ? 'medium' : 'high'}">${score} · ${riskRatingFromScore(1, score)}</span>`; }
function renderRiskDashboard() {
  if (!$('rdKpis')) return;
  rdPopulateFilters();
  const rows = rdBaseRows(), active = rows.filter(rdActive), paired = rows.filter(r => rdScore(r) !== null && rdScore(r, 'residual') !== null);
  const sum = (list, mode) => list.reduce((n, r) => n + (rdScore(r, mode) || 0), 0);
  const avg = list => list.length ? (sum(list, 'inherent') / list.length).toFixed(1) : '—';
  const change = paired.length ? ((sum(paired, 'residual') - sum(paired, 'inherent')) / paired.length).toFixed(1) : '—';
  const cards = [
    ['all', 'Total exposure score', `${sum(rows, 'inherent')} / ${sum(rows, 'residual')}`, 'Inherent / residual · skor, bukan nilai uang'],
    ['active', 'Total active risks', active.length, `${rows.length} risiko dalam cakupan`],
    ['high', 'High risks', active.filter(r => rdHigh(r)).length, 'Risiko aktif · skor 15–25'],
    ['residual', 'Residual high', active.filter(r => rdHigh(r, 'residual')).length, 'Risiko aktif setelah treatment'],
    ['overdue', 'Overdue treatment', rows.filter(rdOverdue).length, 'Deadline terlewat · kecuali Closed'],
    ['paired', 'Risk score net change', change, `${paired.length} penilaian lengkap · residual − inherent`]
  ];
  $('rdKpis').innerHTML = cards.map(([key, label, value, detail]) => `<button type="button" class="stat-panel rd-kpi" data-rd-kpi="${key}"><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail}</span></button>`).join('');
  $('riskManagementCount').textContent = `${riskManagementRows.length} risks`;
  const invalidRange = $('rdPeriod').value === 'custom' && $('rdStart').value && $('rdEnd').value && $('rdStart').value > $('rdEnd').value;
  $('rdFilterStatus').textContent = invalidRange ? 'Tanggal mulai harus sebelum tanggal akhir.' : `${rows.length} dari ${riskManagementRows.length} risiko · rata-rata inherent ${avg(rows)} · data diperbarui saat refresh atau penyimpanan.`;
  const mode = $('rdMode').value;
  $('rdMatrix').innerHTML = `<table class="rd-matrix"><caption>Kemungkinan (baris) × Dampak (kolom)</caption><thead><tr><th scope="col">L / I</th>${[1, 2, 3, 4, 5].map(i => `<th scope="col">${i}</th>`).join('')}</tr></thead><tbody>${[5, 4, 3, 2, 1].map(l => `<tr><th scope="row">${l}</th>${[1, 2, 3, 4, 5].map(i => {
    const count = rows.filter(r => Number(r[mode === 'residual' ? 'residualLikelihood' : 'likelihood']) === l && Number(r[mode === 'residual' ? 'residualImpact' : 'impact']) === i).length;
    const selected = rdState.drill?.kind === 'matrix' && rdState.drill.l === l && rdState.drill.i === i && rdState.drill.mode === mode;
    return `<td><button type="button" class="rd-cell ${l * i <= 4 ? 'rd-low' : l * i <= 12 ? 'rd-medium' : 'rd-high'}" data-rd-cell="${l}-${i}" aria-pressed="${selected}" aria-label="${mode}, likelihood ${l}, impact ${i}, ${count} risiko"><strong>${count}</strong><small>Skor ${l * i}</small></button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  $('rdUnrated').textContent = `${rows.filter(r => rdScore(r, mode) === null).length} risiko belum memiliki penilaian ${mode}.`;
  const bars = (field, source, kind) => {
    const counts = new Map(); source.forEach(r => { const key = r[field] || 'Belum ditetapkan'; counts.set(key, (counts.get(key) || 0) + 1); });
    return [...counts].sort((a, b) => b[1] - a[1]).map(([label, n]) => `<button type="button" class="rd-bar" data-rd-${kind}="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${n} <small>(${Math.round(n / Math.max(source.length, 1) * 100)}%)</small></strong><i><b style="width:${n / Math.max(source.length, 1) * 100}%"></b></i></button>`).join('') || '<p class="muted">Tidak ada risiko dalam cakupan.</p>';
  };
  $('rdCategories').innerHTML = bars('riskCategory', rows, 'category');
  $('rdOwners').innerHTML = bars('riskOwner', active.filter(r => rdHigh(r)), 'owner');
  const monthCounts = new Map(); rows.filter(r => rdHigh(r) && rdDate(r.createdAt)).forEach(r => { const key = rdDate(r.createdAt).slice(0, 7); monthCounts.set(key, (monthCounts.get(key) || 0) + 1); });
  const months = [...new Set(rows.map(r => rdDate(r.createdAt).slice(0, 7)).filter(Boolean))].sort();
  if (months.length) {
    const points = months.map((key, index) => [30 + index * 440 / Math.max(1, months.length - 1), 130 - (monthCounts.get(key) || 0) * 105 / Math.max(1, ...monthCounts.values())]);
    $('rdTrend').innerHTML = `<svg class="rd-trend" viewBox="0 0 500 165" role="group" aria-label="Jumlah risiko High saat ini menurut bulan pendaftaran"><path d="M30 130H470" class="rd-axis"/><polyline points="${points.map(p => p.join(',')).join(' ')}" class="rd-line"/>${points.map(([x, y], n) => `<circle cx="${x}" cy="${y}" r="6" data-rd-month="${months[n]}" tabindex="0" role="button" aria-label="${months[n]}, ${monthCounts.get(months[n]) || 0} risiko High"/><text x="${x}" y="${y - 10}" text-anchor="middle">${monthCounts.get(months[n]) || 0}</text>`).join('')}</svg><div class="rd-months">${months.map(key => `<button type="button" class="button button-quiet" data-rd-month="${key}">${key}: ${monthCounts.get(key) || 0}</button>`).join('')}</div>`;
  } else $('rdTrend').innerHTML = '<p class="muted">Tanggal pendaftaran belum tersedia pada data dalam cakupan.</p>';
  $('rdIndicators').innerHTML = [['High aktif', active.filter(r => rdHigh(r)).length, active.length, 'high'], ['Treatment overdue', active.filter(rdOverdue).length, active.length, 'overdue'], ['Residual high aktif', active.filter(r => rdHigh(r, 'residual')).length, active.length, 'residual']].map(([label, n, total, key]) => `<button type="button" class="rd-indicator" data-rd-kpi="${key}"><span>${label}</span><strong>${total ? Math.round(n / total * 100) : 0}%</strong><progress max="${Math.max(1, total)}" value="${n}" aria-label="${label}"></progress><small>${n} / ${total} risiko aktif</small></button>`).join('');
  const alerts = rows.filter(r => rdOverdue(r) || rdActive(r) && rdHigh(r, 'residual'));
  $('rdAlertCount').textContent = alerts.length;
  $('rdAlerts').innerHTML = '<h3>Risiko yang memerlukan perhatian</h3>' + (alerts.map(r => `<button type="button" class="rd-alert" data-rd-view="${escapeHtml(r.riskId)}"><strong>${escapeHtml(r.riskId)}</strong> · ${escapeHtml(r.identificationRisk)}<small>${rdOverdue(r) ? 'Treatment terlambat: ' + escapeHtml(String(r.deadline).slice(0, 10)) : 'Residual masih High'}</small></button>`).join('') || '<p class="muted">Tidak ada treatment overdue atau residual High aktif.</p>');
  renderRiskRegister();
}
function rdOpenDetail(row) {
  $('rdDetailTitle').textContent = `${row.riskId} · Detail risiko`;
  $('rdDetailBody').innerHTML = `<dl class="rd-details">${[['Identifikasi', row.identificationRisk], ['Kategori', row.riskCategory], ['Aset / perangkat', `${row.effectedAsset || '—'} / ${row.deviceName || '—'}`], ['Risk owner', row.riskOwner], ['Inherent score', rdScore(row)], ['Residual score', rdScore(row, 'residual')], ['Treatment', row.treatmentAction], ['Rencana treatment', row.riskTreatmentDescription], ['Owner of action', row.ownerOfAction], ['Deadline', row.deadline ? String(row.deadline).slice(0, 10) : ''], ['Risk control', row.riskControl], ['Risk cause', row.riskCause], ['Risk analysis', row.riskAnalysis], ['Residual description', row.residualRiskDescription], ['Komentar', row.comment], ['Catatan', row.note], ['Dibuat', rdDate(row.createdAt)], ['Diperbarui', rdDate(row.updatedAt)]].map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value ?? '—') || '—'}</dd>`).join('')}</dl><p class="muted">Komentar dapat diperbarui melalui Quick edit. Riwayat aktivitas tersedia pada modul Audit Trail sesuai hak akses akun; histori skor dan komentar multi-user per risiko belum tersedia.</p>`;
  $('rdDetail').showModal();
}
async function rdExportReport(format) {
  const rows = rdVisibleRows();
  await recordTransferActivity('export', 'risk-management', `risk-dashboard.${format}`, rows.length);
  if (format === 'json') return downloadRiskJson('risk-dashboard.json', { exportedAt: new Date().toISOString(), drill: rdState.drill, riskRegister: rows });
  const response = await fetch('/api/risk-management/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format, riskIds: rows.map(r => r.riskId) }) });
  if (!response.ok) throw new Error('Laporan gagal dibuat. Periksa hak akses dan koneksi.');
  const url = URL.createObjectURL(await response.blob()), link = document.createElement('a'); link.href = url; link.download = `risk-dashboard.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const rdPanel = $('riskDashboardPanel');
rdPanel.addEventListener('change', event => {
  if (event.target.id === 'rdExport') { const format = event.target.value; event.target.value = ''; if (format) rdExportReport(format).catch(error => { $('rdFilterStatus').textContent = error.message; }); return; }
  if (event.target.id === 'rdPeriod') { $('rdStartLabel').hidden = $('rdEndLabel').hidden = event.target.value !== 'custom'; }
  if (['rdScope', 'rdPeriod', 'rdStart', 'rdEnd', 'rdCategory', 'rdOwner', 'rdMode'].includes(event.target.id)) { rdState.drill = null; riskRegisterPage = 1; renderRiskDashboard(); }
});
$('riskManagementView').addEventListener('click', event => {
  const button = event.target.closest('button, [data-rd-month]'); if (!button) return;
  if (button.id === 'rdRefresh') { button.disabled = true; loadRiskManagement().catch(error => { $('rdFilterStatus').textContent = error.message; }).finally(() => { button.disabled = false; }); }
  if (button.id === 'rdReset') rdResetFilters();
  if (button.id === 'rdClearDrill') { rdState.drill = null; riskRegisterPage = 1; renderRiskDashboard(); }
  if (button.id === 'rdReturnDashboard') { setRiskManagementTab('dashboard'); $('riskDashboardPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (button.id === 'rdAlertsButton') { $('rdAlerts').hidden = !$('rdAlerts').hidden; button.setAttribute('aria-expanded', String(!$('rdAlerts').hidden)); }
  if (button.id === 'rdDetailClose') $('rdDetail').close();
  if (button.dataset.rdKpi) rdSetDrill(button.dataset.rdKpi === 'all' ? null : { kind: button.dataset.rdKpi, label: button.querySelector('.stat-label')?.textContent || button.textContent.trim() });
  if (button.dataset.rdCell) { const [l, i] = button.dataset.rdCell.split('-').map(Number); rdSetDrill({ kind: 'matrix', mode: $('rdMode').value, l, i, label: `${$('rdMode').value} · L${l} × I${i}` }); }
  for (const kind of ['category', 'owner', 'month']) { const value = button.dataset['rd' + kind[0].toUpperCase() + kind.slice(1)]; if (value) rdSetDrill({ kind, value, label: value }); }
  if (button.dataset.rdView || button.dataset.rdEdit) { const row = riskManagementRows.find(r => r.riskId === (button.dataset.rdView || button.dataset.rdEdit)); if (row) { if (button.dataset.rdEdit && canPerform('risk-management', 'update')) fillRiskManagementForm(row); else rdOpenDetail(row); } }
});

rdPanel.addEventListener('keydown', event => {
  if (event.target.matches('[data-rd-month][role=button]') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});
