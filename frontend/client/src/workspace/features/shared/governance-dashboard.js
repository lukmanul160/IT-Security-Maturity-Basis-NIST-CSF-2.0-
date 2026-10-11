// Shared presentation helpers for dashboards backed by existing module records.
function gdToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function gdDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date ? date : '';
}
function gdDays(value) { const date = gdDate(value); return date ? Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(gdToday() + 'T00:00:00Z')) / 86400000) : null; }
function gdReviewMatches(date, mode, active = true) {
  const days = gdDays(date);
  return !mode || mode === 'missing' && days === null || active && (mode === 'overdue' && days !== null && days < 0 || mode === 'soon' && days !== null && days >= 0 && days <= 30);
}
function gdOptions(id, values, label) {
  const element = $(id), selected = element.value;
  element.innerHTML = `<option value="">${escapeHtml(label)}</option>` + [...new Set(values.filter(Boolean))].sort().map(value => `<option value="${escapeHtml(String(value))}">${escapeHtml(String(value))}</option>`).join('');
  element.value = selected; if (element.selectedIndex < 0) element.value = '';
}
function gdBars(id, rows, field, attribute, fallback = 'Belum diisi') {
  const counts = new Map();
  rows.forEach(row => { const value = String(field(row) || ''); counts.set(value, (counts.get(value) || 0) + 1); });
  $(id).innerHTML = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => `<button class="rd-bar" type="button" data-${attribute}="${escapeHtml(value)}"><span>${escapeHtml(value || fallback)}</span><strong>${count} <small>(${Math.round(count / rows.length * 100)}%)</small></strong><i><b style="width:${count / Math.max(...counts.values()) * 100}%"></b></i></button>`).join('') || '<p class="muted">Tidak ada data sesuai filter.</p>';
}
function gdTimeline(id, rows, dateOf, attribute) {
  const counts = new Map();
  rows.forEach(row => { const month = gdDate(dateOf(row)).slice(0, 7); if (month) counts.set(month, (counts.get(month) || 0) + 1); });
  $(id).innerHTML = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => `<button class="rd-bar" type="button" data-${attribute}="${month}"><span>${escapeHtml(new Date(month + '-01T00:00:00Z').toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' }))}</span><strong>${count}</strong><i><b style="width:${count / Math.max(...counts.values()) * 100}%"></b></i></button>`).join('') || '<p class="muted">Belum ada jadwal pada data yang dipilih.</p>';
}
function gdCalendar(id, monthId, rows, dateOf, attribute) {
  const input = $(monthId); if (!input.value) input.value = gdToday().slice(0, 7);
  const month = input.value;
  if (!/^\d{4}-\d{2}$/.test(month) || !gdDate(month + '-01')) { $(id).innerHTML = '<p class="muted">Pilih bulan yang valid.</p>'; return; }
  const first = new Date(month + '-01T00:00:00Z'), count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const counts = new Map(); rows.forEach(row => { const date = gdDate(dateOf(row)); if (date) counts.set(date, (counts.get(date) || 0) + 1); });
  $(id).innerHTML = '<span aria-hidden="true"></span>'.repeat(first.getUTCDay()) + Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`, n = counts.get(date) || 0, days = gdDays(date);
    return `<button type="button" class="ra-calendar-day ${n ? days < 0 ? 'ra-day-overdue' : days <= 30 ? 'ra-day-soon' : 'ra-day-scheduled' : ''}" data-${attribute}="${date}" ${n ? '' : 'disabled'} aria-label="${date}, ${n} jadwal"><strong>${index + 1}</strong>${n ? `<small>${n} jadwal</small>` : ''}</button>`;
  }).join('');
}
function gdKpis(id, metrics, attribute) {
  $(id).innerHTML = metrics.map(([kind, label, value, detail, valueId]) => `<button class="stat-panel rd-kpi" type="button" data-${attribute}="${kind}"><span class="stat-label">${escapeHtml(label)}</span><strong${valueId ? ` id="${valueId}"` : ''}>${escapeHtml(String(value))}</strong><span class="stat-detail">${escapeHtml(detail)}</span></button>`).join('');
}
function gdExport(filename, rows, columns, format) {
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  const content = format === 'csv' ? '\uFEFF' + [columns.map(([label]) => cell(label)).join(','), ...rows.map(row => columns.map(([, getter]) => cell(getter(row))).join(','))].join('\r\n') : JSON.stringify(rows, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${filename}-${gdToday()}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
