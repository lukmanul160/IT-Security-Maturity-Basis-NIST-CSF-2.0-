function renderRiskDropdownManager() {
  const panel = $('riskDropdownManager'); if (!panel) return;
  const labels = { riskCategory: 'Risk category', effectedAsset: 'Effected asset', deviceName: 'Nama perangkat', riskOwner: 'Risk owner', treatmentAction: 'Treatment action' };
  const filter = $('riskDropdownFilter').value;
  const records = dropdownRows().filter(row => filter === 'all' || row.fieldName === filter);
  panel.querySelector('tbody').innerHTML = records.map(row => `<tr><td>${escapeHtml(labels[row.fieldName] || row.fieldName)}</td><td>${escapeHtml(row.optionValue)}</td><td>${escapeHtml(row.sortOrder || 0)}</td><td><button class="attachment-action-button" type="button" data-dropdown-edit="${escapeHtml(row.id)}" data-option-action="${String(row.id).startsWith('fallback-') ? 'create' : 'update'}">${String(row.id).startsWith('fallback-') ? 'Simpan pilihan' : 'Edit'}</button>${String(row.id).startsWith('fallback-') ? '<span class="muted"> Dari risk register</span>' : `<button class="attachment-action-button danger" type="button" data-dropdown-delete="${escapeHtml(row.id)}">Hapus</button>`}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada pilihan. Klik Tambah pilihan untuk membuatnya.</td></tr>';
}
function ensureRiskDropdownManager() {
  if ($('riskDropdownManager')) return;
  const panel = document.createElement('section'); panel.id = 'riskDropdownManager'; panel.className = 'indicator-sheet dropdown-manager';
  const options = '<option value="effectedAsset">Effected asset</option><option value="riskCategory">Risk category</option><option value="deviceName">Nama perangkat</option><option value="riskOwner">Risk owner</option><option value="treatmentAction">Treatment action</option>';
  panel.innerHTML = `<div class="indicator-sheet-title"><div><p class="eyebrow">PILIHAN FORMULIR</p><h3>Daftar pilihan</h3></div><button class="button button-accent" id="riskDropdownNewButton" type="button">Tambah pilihan</button></div><label class="search-box">Jenis pilihan<select id="riskDropdownFilter"><option value="all">Semua pilihan</option>${options}</select></label><form id="riskDropdownForm" class="risk-register-form" hidden><input id="riskDropdownId" type="hidden"><div class="risk-register-grid"><label>Jenis pilihan<select id="riskDropdownField">${options}</select></label><label>Nama pilihan<input id="riskDropdownValue" required maxlength="200"></label><label>Urutan<input id="riskDropdownSort" type="number" min="0" step="1" value="0"></label></div><div class="csf-form-actions"><button class="button button-accent" type="submit" id="riskDropdownSave">Simpan pilihan</button><button class="button button-quiet" id="riskDropdownCancel" type="button">Batal</button></div></form><div class="excel-wrap"><table class="excel-table"><thead><tr><th>Jenis pilihan</th><th>Nama pilihan</th><th>Urutan</th><th>Aksi</th></tr></thead><tbody></tbody></table></div>`;
  $('riskOptionsPanel').append(panel);
  $('riskDropdownNewButton').addEventListener('click', () => {
    if (!canPerform('risk-management', 'create')) return;
    $('riskDropdownForm').reset(); $('riskDropdownId').value = '';
    if ($('riskDropdownFilter').value !== 'all') $('riskDropdownField').value = $('riskDropdownFilter').value;
    $('riskDropdownForm').hidden = false; $('riskDropdownValue').focus();
  });
  $('riskDropdownFilter').addEventListener('change', renderRiskDropdownManager);
  $('riskDropdownCancel').addEventListener('click', () => { $('riskDropdownForm').hidden = true; });
  $('riskDropdownForm').addEventListener('submit', saveRiskDropdown);
  panel.addEventListener('click', event => {
    const edit = event.target.closest('[data-dropdown-edit]'); const remove = event.target.closest('[data-dropdown-delete]');
    if (edit) fillRiskDropdown(dropdownRows().find(row => String(row.id) === edit.dataset.dropdownEdit));
    if (remove) deleteRiskDropdown(remove.dataset.dropdownDelete);
  });
}
function fillRiskDropdown(row) {
  if (!row || !canPerform('risk-management', String(row.id).startsWith('fallback-') ? 'create' : 'update')) return;
  $('riskDropdownId').value = String(row.id).startsWith('fallback-') ? '' : row.id; $('riskDropdownField').value = row.fieldName; $('riskDropdownValue').value = row.optionValue; $('riskDropdownSort').value = row.sortOrder || 0;
  $('riskDropdownForm').hidden = false; $('riskDropdownValue').focus();
}
async function saveRiskDropdown(event) {
  event.preventDefault(); const id = $('riskDropdownId').value; const existing = id && !id.startsWith('fallback-');
  if (!canPerform('risk-management', existing ? 'update' : 'create')) return;
  const button = $('riskDropdownSave'); button.disabled = true;
  try {
    const data = { fieldName: $('riskDropdownField').value, optionValue: $('riskDropdownValue').value.trim(), sortOrder: Number($('riskDropdownSort').value) };
    const response = await fetch(existing ? `/api/risk-management/dropdowns/${id}` : '/api/risk-management/dropdowns', { method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Pilihan gagal disimpan.');
    await loadRiskManagement(); $('riskDropdownForm').hidden = true; $('riskDropdownStatus').textContent = 'Pilihan berhasil disimpan dan tersedia pada formulir risk register.';
  } catch (error) { $('riskDropdownStatus').textContent = error.message; }
  finally { button.disabled = false; }
}
async function deleteRiskDropdown(id) {
  if (String(id).startsWith('fallback-') || !canPerform('risk-management', 'delete') || !confirm('Hapus pilihan ini?')) return;
  try {
    const response = await fetch(`/api/risk-management/dropdowns/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Pilihan gagal dihapus.');
    await loadRiskManagement(); if ($('riskDropdownId').value === String(id)) $('riskDropdownForm').hidden = true; $('riskDropdownStatus').textContent = 'Pilihan berhasil dihapus.';
  } catch (error) { $('riskDropdownStatus').textContent = error.message; }
}
function setRiskManagementTab(key) {
  const panels = { dashboard: 'riskDashboardPanel', register: 'riskRegisterPanel', options: 'riskOptionsPanel' };
  for (const [tab, id] of Object.entries(panels)) $(id).hidden = tab !== key;
  document.querySelectorAll('[data-risk-tab]').forEach(button => { const active = button.dataset.riskTab === key; button.classList.toggle('button-accent', active); button.classList.toggle('button-quiet', !active); button.setAttribute('aria-selected', String(active)); });
}
