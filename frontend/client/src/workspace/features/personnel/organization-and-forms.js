function setPersonnelCertificationTab(tab) {
  const panels = { organization: 'personnelOrganizationPanel', map: 'personnelCertificationMapPanel', reference: 'personnelReferenceRoadmapPanel' };
  if (!panels[tab]) return;
  Object.entries(panels).forEach(([key, id]) => { $(id).hidden = key !== tab; });
  $('personnelWorkflowStatus').hidden = tab === 'reference';
  document.querySelectorAll('[data-personnel-tab]').forEach(button => {
    const active = button.dataset.personnelTab === tab;
    button.classList.toggle('button-accent', active);
    button.classList.toggle('button-quiet', !active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (tab === 'organization') renderOrganizationPersonnelStructure();
  if (tab === 'map') resizeCertificationCanvases();
}
function renderOrganizationStructure() { const rows = personnelCertifications; const people = [...new Map(rows.map(row => [`${row.personnelName}|${row.employeeId || ''}`, row])).values()]; const groups = [...rows.reduce((map, row) => { const role = row.personnelRole || 'Unassigned / General Security'; if (!map.has(role)) map.set(role, []); map.get(role).push(row); return map; }, new Map())].sort(([first], [second]) => first.localeCompare(second)); const active = rows.filter(row => row.status === 'Active').length; const attention = rows.filter(row => ['Planned', 'Expired'].includes(row.status)).length; $('organizationPersonCount').textContent = people.length; $('organizationPersonnelCount').textContent = `${people.length} personnel`; $('organizationActiveCount').textContent = active; $('organizationRoleCount').textContent = groups.length; $('organizationAttentionCount').textContent = attention; $('organizationStructure').innerHTML = groups.map(([role, groupRows]) => { const groupedPeople = [...new Map(groupRows.map(row => [`${row.personnelName}|${row.employeeId || ''}`, row])).values()]; return `<section class="organization-group"><header><div><p class="eyebrow">ORGANIZATION UNIT</p><h3>${escapeHtml(role)}</h3></div><span>${groupedPeople.length} person${groupedPeople.length === 1 ? '' : 'nel'}</span></header><div class="organization-people">${groupedPeople.map(person => { const certifications = groupRows.filter(row => row.personnelName === person.personnelName && (row.employeeId || '') === (person.employeeId || '')); return `<article class="organization-person"><div class="organization-person-avatar">${escapeHtml(person.personnelName.slice(0, 1).toUpperCase())}</div><div><h4>${escapeHtml(person.personnelName)}</h4><small>${escapeHtml(person.employeeId || 'Employee ID belum diisi')}</small><div class="organization-certifications">${certifications.map(row => `<span class="status-${String(row.status || 'Planned').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.certificationName)} · ${escapeHtml(row.status || 'Planned')}</span>`).join('')}</div></div></article>`; }).join('')}</div></section>`; }).join('') || '<div class="empty-state">Belum ada data personel sertifikasi.</div>'; }
function renderOrganizationHierarchy() { const uniquePeople = [...new Map(personnelCertifications.map(row => [`${row.personnelName}|${row.employeeId || ''}`, { ...row, certifications: [] }])).values()]; const people = new Map(uniquePeople.map(person => { person.certifications = personnelCertifications.filter(row => row.personnelName === person.personnelName && (row.employeeId || '') === (person.employeeId || '')); return [person.personnelName, person]; })); $('organizationPersonnelNames').innerHTML = uniquePeople.map(person => `<option value="${escapeHtml(person.personnelName)}">`).join(''); const children = new Map(); uniquePeople.forEach(person => { const supervisor = person.supervisorName && people.has(person.supervisorName) ? person.supervisorName : ''; if (!children.has(supervisor)) children.set(supervisor, []); children.get(supervisor).push(person); }); const active = personnelCertifications.filter(row => row.status === 'Active').length; const attention = personnelCertifications.filter(row => ['Planned', 'Expired'].includes(row.status)).length; const roles = new Set(uniquePeople.map(person => person.personnelRole || 'Unassigned')); $('organizationPersonCount').textContent = uniquePeople.length; $('organizationPersonnelCount').textContent = `${uniquePeople.length} personnel`; $('organizationActiveCount').textContent = active; $('organizationRoleCount').textContent = roles.size; $('organizationAttentionCount').textContent = attention; const renderNode = (person, level = 0, trail = new Set()) => { if (trail.has(person.personnelName)) return ''; const nextTrail = new Set(trail).add(person.personnelName); const reports = (children.get(person.personnelName) || []).sort((first, second) => first.personnelName.localeCompare(second.personnelName)); const certificationLabels = person.certifications.map(row => `<span class="status-${String(row.status || 'Planned').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.certificationName)} · ${escapeHtml(row.status || 'Planned')}</span>`).join(''); return `<article class="organization-node" style="--org-level:${level}"><div class="organization-person"><div class="organization-person-avatar">${escapeHtml(person.personnelName.slice(0, 1).toUpperCase())}</div><div><h4>${escapeHtml(person.personnelName)}</h4><small>${escapeHtml(person.personnelRole || 'Jabatan belum diisi')} · ${escapeHtml(person.employeeId || 'Employee ID belum diisi')}</small><div class="organization-certifications">${certificationLabels}</div></div></div>${reports.length ? `<div class="organization-reports">${reports.map(child => renderNode(child, level + 1, nextTrail)).join('')}</div>` : ''}</article>`; }; const roots = (children.get('') || []).sort((first, second) => first.personnelName.localeCompare(second.personnelName)); $('organizationStructure').innerHTML = roots.map(person => renderNode(person)).join('') || '<div class="empty-state">Belum ada data personel. Tambahkan sertifikasi dan isi atasan langsung untuk membangun bagan organisasi.</div>'; }
function renderOrganizationPersonnelStructure() {
  const people = organizationPersonnel;
  const canManage = currentUserRole === 'admin' || (currentUserRole === 'editor' && currentUserPermissions.includes('personnel-certification'));
  const certificationsFor = person => personnelCertifications.filter(row => String(row.personnelId) === String(person.id));
  $('organizationPersonnelNames').innerHTML = people.map(person => `<option value="${escapeHtml(person.personnelName)}">`).join('');
  $('organizationPersonnelBody').innerHTML = people.map(person => `<tr>
    <td><strong>${escapeHtml(person.personnelName)}</strong></td><td>${escapeHtml(person.employeeId || '-')}</td>
    <td>${escapeHtml(person.personnelRole || '-')}</td><td>${escapeHtml(person.supervisorName || 'Tidak ada / posisi teratas')}</td>
    <td>${certificationsFor(person).length} sertifikasi</td>
    <td>${canManage ? `<button class="attachment-action-button" type="button" data-organization-certify="${person.id}">Tambah sertifikasi</button>
      <button class="attachment-action-button" type="button" data-organization-edit="${person.id}">Edit pegawai</button>
      <button class="attachment-action-button danger" type="button" data-organization-delete="${person.id}">Hapus</button>` : '-'}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada pegawai. Daftarkan pegawai terlebih dahulu, lalu tambahkan sertifikasinya.</td></tr>';
  const children = new Map();
  people.forEach(person => {
    const supervisors = people.filter(candidate => candidate.personnelName === person.supervisorName && candidate.id !== person.id);
    const parentId = supervisors.length === 1 ? String(supervisors[0].id) : '';
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(person);
  });
  $('organizationPersonCount').textContent = people.length;
  $('organizationPersonnelCount').textContent = `${people.length} pegawai`;
  $('organizationActiveCount').textContent = personnelCertifications.filter(row => row.status === 'Active').length;
  $('organizationRoleCount').textContent = new Set(people.map(person => person.personnelRole || 'Unassigned')).size;
  $('organizationAttentionCount').textContent = personnelCertifications.filter(row => ['Planned', 'Expired'].includes(row.status)).length;
  const rendered = new Set();
  const renderNode = (person, level = 0, trail = new Set()) => {
    const key = String(person.id);
    if (trail.has(key)) return '';
    rendered.add(key);
    const nextTrail = new Set(trail).add(key);
    const reports = (children.get(key) || []).sort((a,b) => a.personnelName.localeCompare(b.personnelName));
    const certifications = certificationsFor(person);
    return `<article class="organization-node" style="--org-level:${level}"><div class="organization-person"><div class="organization-person-avatar">${escapeHtml(person.personnelName.slice(0, 1).toUpperCase())}</div><div><h4>${escapeHtml(person.personnelName)}</h4><small>${escapeHtml(person.personnelRole || 'Jabatan belum diisi')} &middot; ${escapeHtml(person.employeeId || 'Employee ID belum diisi')}</small><div class="organization-certifications">${certifications.map(row => `<span class="status-${String(row.status || 'Planned').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.certificationName)} &middot; ${escapeHtml(row.status || 'Planned')}</span>`).join('') || '<span>Belum ada sertifikasi</span>'}</div></div></div>${reports.length ? `<div class="organization-reports">${reports.map(child => renderNode(child, level + 1, nextTrail)).join('')}</div>` : ''}</article>`;
  };
  let tree = (children.get('') || []).map(person => renderNode(person)).join('');
  // Keep legacy cycles or ambiguous supervisor names visible for correction.
  people.forEach(person => { if (!rendered.has(String(person.id))) tree += renderNode(person); });
  $('organizationStructure').innerHTML = tree || '<div class="empty-state">Daftarkan pegawai. Atasan langsung dapat dikosongkan untuk posisi paling atas.</div>';
}
function ensurePersonnelCertificationView() { if ($('personnelCertificationView')) return; const view = document.createElement('section'); view.id = 'personnelCertificationView'; view.className = 'view'; view.appendChild($('riskCertificationsPanel')); document.querySelector('.main-content').appendChild(view); }
function showPersonnelCertificationView() { ensurePersonnelCertificationView(); ensureCertificationLevelField(); $('riskCertificationsPanel').hidden = false; $('roadmapCatalogNewButton').hidden = currentUserRole !== 'admin'; document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('personnelCertificationView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'personnel-certification')); setPersonnelCertificationTab('organization'); loadCertifications().catch(() => { $('personnelWorkflowStatus').textContent = 'Data pegawai belum dapat dimuat. Pastikan server sudah diperbarui.'; }); saveUiState('personnel-certification'); }
document.querySelector('[data-view="personnel-certification"]').addEventListener('click', showPersonnelCertificationView);
document.querySelectorAll('[data-personnel-tab]').forEach(button => button.addEventListener('click', () => setPersonnelCertificationTab(button.dataset.personnelTab)));
document.querySelector('#organizationPersonnelNewButton').addEventListener('click', () => openOrganizationPersonnelForm()); $('organizationPersonnelForm').addEventListener('submit', saveOrganizationPersonnel); $('organizationPersonnelCancel').addEventListener('click', () => $('organizationPersonnelModal').close()); $('organizationPersonnelBody').addEventListener('click', event => { const edit = event.target.closest('[data-organization-edit]'); const remove = event.target.closest('[data-organization-delete]'); if (edit) openOrganizationPersonnelForm(organizationPersonnel.find(person => String(person.id) === edit.dataset.organizationEdit)); if (remove) deleteOrganizationPersonnel(remove.dataset.organizationDelete); });
document.querySelector('#certificationBody').addEventListener('click', event => { const canvas = event.target.closest('[data-certification-canvas]'); if (canvas) addCertificationToCanvas(canvas.dataset.certificationCanvas); });
document.addEventListener('click', event => { const canvas = event.target.closest('[data-certification-canvas]'); if (canvas && !event.target.closest('#certificationBody')) { event.preventDefault(); addCertificationToCanvas(canvas.dataset.certificationCanvas); } });
async function saveRiskManagement(event) { event.preventDefault(); const originalId = $('riskRegisterOriginalId').value; const data = riskManagementData(); const response = await fetch(originalId ? `/api/risk-management/${encodeURIComponent(originalId)}` : '/api/risk-management', { method: originalId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); $('riskRegisterStatus').textContent = response.ok ? 'Risk saved' : ((await response.json().catch(() => ({}))).error || 'Save failed'); if (response.ok) { $('riskManagementModal').close(); resetRiskManagementForm(); await loadRiskManagement(); } }
async function deleteRiskManagement(id) { if (!confirm(`Delete risk ${id}?`)) return; const response = await fetch(`/api/risk-management/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (response.ok) await loadRiskManagement(); }
function ensureCertificationLevelField() { if ($('certificationLevel')) return; const reference = $('certificationReferenceUrl').closest('label'); const label = document.createElement('label'); label.innerHTML = 'Level<select id="certificationLevel"><option>Entry Level</option><option>Intermediate</option><option>Advanced / Expert</option></select>'; reference.after(label); }
function syncCertificationCatalogFields() { const match = certificationRoadmapCatalog.find(row => row.certificationName.toLowerCase() === $('certificationName').value.trim().toLowerCase()); if (!match) return; $('certificationIssuer').value = match.issuer || ''; $('certificationReferenceUrl').value = match.referenceUrl || ''; ensureCertificationLevelField(); $('certificationLevel').value = match.certificationLevel || 'Intermediate'; $('certificationStatus').textContent = 'Catalog details applied'; }
function renderCertificationCatalogOptions() { $('roadmapCatalogNames').innerHTML = certificationRoadmapCatalog.map(row => `<option value="${escapeHtml(row.certificationName)}">${escapeHtml(row.domain)}</option>`).join(''); }
async function refreshCertificationCatalogOptions() { const response = await fetch('/api/certification-roadmap-catalog', { cache: 'no-store' }); if (!response.ok) throw new Error('Roadmap catalog unavailable'); certificationRoadmapCatalog = await response.json(); renderCertificationCatalogOptions(); }
const certificationData = () => ({ personnelId: $('certificationPersonnelId').value, certificationName: $('certificationName').value, issuer: $('certificationIssuer').value, referenceUrl: $('certificationReferenceUrl').value, certificationLevel: $('certificationLevel').value, status: $('certificationCertificationStatus').value, issueDate: $('certificationIssueDate').value, expiryDate: $('certificationExpiryDate').value, notes: $('certificationNotes').value });
function syncCertificationPersonnelFields() {
  const person = organizationPersonnel.find(row => String(row.id) === $('certificationPersonnelId').value);
  $('certificationEmployeeId').value = person?.employeeId || '';
  $('certificationPersonnelRole').value = person?.personnelRole || '';
  $('certificationSupervisorName').value = person?.supervisorName || '';
}
function renderCertificationPersonnelOptions(selectedId = $('certificationPersonnelId').value) {
  $('certificationPersonnelId').innerHTML = '<option value="">Pilih pegawai terdaftar</option>' + organizationPersonnel.map(person => `<option value="${person.id}">${escapeHtml(person.personnelName)}${person.employeeId ? ` — ${escapeHtml(person.employeeId)}` : ''}${person.personnelRole ? ` (${escapeHtml(person.personnelRole)})` : ''}</option>`).join('');
  $('certificationPersonnelId').value = String(selectedId || '');
  syncCertificationPersonnelFields();
  $('certificationNewButton').disabled = organizationPersonnel.length === 0;
  $('certificationPersonnelHint').hidden = organizationPersonnel.length > 0;
}
function resetCertificationForm() {
  ensureCertificationLevelField();
  $('certificationForm').reset();
  $('certificationForm').hidden = false;
  $('certificationId').value = '';
  $('certificationDelete').hidden = true;
  $('certificationFormTitle').textContent = 'Tambah sertifikasi';
  $('certificationStatus').textContent = 'Pilih pegawai, lalu isi sertifikasinya.';
  renderCertificationPersonnelOptions('');
}
function startNewCertification(personnelId = '') {
  if (!organizationPersonnel.length) {
    setPersonnelCertificationTab('organization');
    $('personnelWorkflowStatus').textContent = 'Daftarkan pegawai terlebih dahulu sebelum menambahkan sertifikasi.';
    return;
  }
  setPersonnelCertificationTab('map');
  resetCertificationForm();
  renderCertificationPersonnelOptions(personnelId);
  openCertificationModal();
}
async function openCertificationModal() { const modal = $('certificationModal'); if (modal && !modal.open) modal.showModal(); try { await refreshCertificationCatalogOptions(); } catch (error) { $('certificationStatus').textContent = 'Catalog unavailable; enter details manually'; } }
function fillCertificationForm(row) {
  setPersonnelCertificationTab('map');
  resetCertificationForm();
  $('certificationId').value = row.id;
  $('certificationDelete').hidden = false;
  renderCertificationPersonnelOptions(row.personnelId);
  $('certificationName').value = row.certificationName || '';
  $('certificationIssuer').value = row.issuer || '';
  $('certificationReferenceUrl').value = row.referenceUrl || '';
  $('certificationLevel').value = row.certificationLevel || 'Intermediate';
  $('certificationCertificationStatus').value = row.status || 'Planned';
  $('certificationIssueDate').value = row.issueDate || '';
  $('certificationExpiryDate').value = row.expiryDate || '';
  $('certificationNotes').value = row.notes || '';
  $('certificationFormTitle').textContent = `Edit ${row.certificationName}`;
  $('certificationStatus').textContent = `Editing ${row.personnelName}`;
  openCertificationModal();
}
function certificationCard(row) { const statusClass = String(row.status || 'Planned').toLowerCase().replaceAll(' ', '-'); return `<article class="certification-card" tabindex="0" role="button" aria-label="View details for ${escapeHtml(row.certificationName)} - ${escapeHtml(row.personnelName)}" data-certification-id="${row.id}" style="left:${Math.max(0, row.positionX || 24)}px;top:${Math.max(0, row.positionY || 24)}px;width:${Math.min(180, Math.max(145, row.cardWidth || 165))}px;height:${Math.min(92, Math.max(72, row.cardHeight || 82))}px"><span class="certification-card-status status-${statusClass}">${escapeHtml(row.status || 'Planned')}</span><h4>${escapeHtml(row.certificationName)}</h4><p><strong>${escapeHtml(row.personnelName)}</strong></p><span class="resize-handle" aria-label="Resize certification card"></span></article>`; }
let suppressCertificationCardClick = false;
document.addEventListener('click', event => { const card = event.target.closest('.certification-card'); if (!card || event.target.closest('.resize-handle')) return; if (suppressCertificationCardClick) { suppressCertificationCardClick = false; return; } const row = personnelCertifications.find(item => String(item.id) === card.dataset.certificationId); if (row) fillCertificationForm(row); });
let certificationCardPointerStart = null;
document.addEventListener('pointerdown', event => { const card = event.target.closest('.certification-card'); if (card && !event.target.closest('.resize-handle')) certificationCardPointerStart = { card, x: event.clientX, y: event.clientY }; });
document.addEventListener('pointerup', event => { const start = certificationCardPointerStart; certificationCardPointerStart = null; if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return; const row = personnelCertifications.find(item => String(item.id) === start.card.dataset.certificationId); if (row) fillCertificationForm(row); });
document.addEventListener('keydown', event => { if (!['Enter', ' '].includes(event.key)) return; const card = event.target.closest('.certification-card'); if (!card) return; event.preventDefault(); const row = personnelCertifications.find(item => String(item.id) === card.dataset.certificationId); if (row) fillCertificationForm(row); });
document.querySelector('#certificationNewButton').addEventListener('click', () => startNewCertification());
$('certificationPersonnelId').addEventListener('change', syncCertificationPersonnelFields);
$('organizationPersonnelBody').addEventListener('click', event => { const button = event.target.closest('[data-organization-certify]'); if (button) startNewCertification(button.dataset.organizationCertify); });
document.querySelector('#certificationCancel').addEventListener('click', () => $('certificationModal').close());
const certificationLevels = ['Entry Level', 'Intermediate', 'Advanced / Expert'];
function renderCertifications() { const board = $('certificationBoard'); if (!board) return; const employeeRows = personnelCertifications; const canvasRows = employeeRows; const grouped = [...employeeRows.reduce((groups, row) => { const key = String(row.personnelId); if (!groups.has(key)) groups.set(key, { ...row, certifications: [] }); groups.get(key).certifications.push(row); return groups; }, new Map()).values()]; $('certificationCount').textContent = `${grouped.length} personnel${grouped.length === 1 ? '' : 's'} · ${employeeRows.length} certifications · ${certificationRoadmapCatalog.length} roadmap items`; $('certificationBoardEmpty').hidden = canvasRows.length > 0; board.querySelectorAll('.certification-lane').forEach(lane => lane.remove()); board.insertAdjacentHTML('beforeend', certificationLevels.map(level => `<section class="certification-lane"><header><h4>${level}</h4><span>${canvasRows.filter(row => row.certificationLevel === level).length}</span></header><div class="certification-lane-canvas">${canvasRows.filter(row => row.certificationLevel === level).map(certificationCard).join('') || '<p class="certification-lane-empty">Belum ada sertifikasi di canvas</p>'}</div></section>`).join('')); document.querySelector('.certification-table thead').innerHTML = '<tr><th>Personnel</th><th>Employee ID</th><th>Role / domain</th><th>Certifications held</th><th>Expiry</th><th>Actions</th></tr>'; $('certificationBody').innerHTML = grouped.map(person => `<tr><td><strong>${escapeHtml(person.personnelName)}</strong></td><td>${escapeHtml(person.employeeId || '-')}</td><td>${escapeHtml(person.personnelRole || '-')}</td><td class="certification-summary-list">${person.certifications.map(row => `<div class="certification-summary-item"><a href="${escapeHtml(row.referenceUrl || '#')}" ${row.referenceUrl ? 'target="_blank" rel="noopener"' : ''}>${escapeHtml(row.certificationName)}</a><span class="status-${String(row.status || '').toLowerCase().replaceAll(' ', '-')}">${escapeHtml(row.status || '-')}</span></div>`).join('')}</td><td>${person.certifications.map(row => `<div>${escapeHtml(row.expiryDate || '-')}</div>`).join('')}</td><td>${person.certifications.map(row => `<div class="certification-row-actions"><button class="attachment-action-button" type="button" data-certification-canvas="${row.id}">Move on canvas</button><button class="attachment-action-button" type="button" data-certification-edit="${row.id}">Edit</button><button class="attachment-action-button danger" type="button" data-certification-delete="${row.id}">Delete</button></div>`).join('')}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada pegawai yang memiliki sertifikasi.</td></tr>'; renderCertificationReference(); }
function resizeCertificationCanvases() { document.querySelectorAll('.certification-lane-canvas').forEach(canvas => { const cards = [...canvas.querySelectorAll('.certification-card')].sort((first, second) => (parseFloat(first.style.top) || 0) - (parseFloat(second.style.top) || 0) || (parseFloat(first.style.left) || 0) - (parseFloat(second.style.left) || 0)); const widestCard = Math.max(145, ...cards.map(card => card.offsetWidth)); const tallestCard = Math.max(72, ...cards.map(card => card.offsetHeight)); const horizontalPadding = 18; const availableWidth = Math.max(widestCard, canvas.clientWidth - horizontalPadding * 2); const columns = Math.max(1, Math.floor((availableWidth + 16) / (widestCard + 16))); const gap = columns > 1 ? (availableWidth - columns * widestCard) / (columns - 1) : 0; cards.forEach((card, index) => { card.style.left = `${horizontalPadding + (index % columns) * (widestCard + gap)}px`; card.style.top = `${18 + Math.floor(index / columns) * (tallestCard + 20)}px`; }); const bottom = Math.max(232, ...cards.map(card => (parseFloat(card.style.top) || 0) + card.offsetHeight + 24)); canvas.style.minHeight = `${bottom}px`; }); }
new MutationObserver(resizeCertificationCanvases).observe($('certificationBoard'), { childList: true, subtree: true });
function roadmapCatalogData() { return { domain: $('roadmapCatalogDomain').value, certificationName: $('roadmapCatalogName').value, issuer: $('roadmapCatalogIssuer').value, referenceUrl: $('roadmapCatalogUrl').value, certificationLevel: $('roadmapCatalogLevel').value, notes: $('roadmapCatalogNotes').value }; }
function setRoadmapCatalogEditable(editable) { $('roadmapCatalogForm').querySelectorAll('input, textarea, select').forEach(element => { if (element.id !== 'roadmapCatalogId') element.disabled = !editable; }); $('roadmapCatalogSave').hidden = !editable; $('roadmapCatalogDelete').hidden = !editable || !$('roadmapCatalogId').value; }
function openRoadmapCatalogModal(row = null) { const editable = currentUserRole === 'admin'; const referenceUrl = row?.referenceUrl || ''; $('roadmapCatalogForm').reset(); $('roadmapCatalogId').value = row?.id || ''; $('roadmapCatalogDomain').value = row?.domain || ''; $('roadmapCatalogName').value = row?.certificationName || ''; $('roadmapCatalogIssuer').value = row?.issuer || ''; $('roadmapCatalogUrl').value = referenceUrl; $('roadmapCatalogLevel').value = row?.certificationLevel || 'Intermediate'; $('roadmapCatalogNotes').value = row?.notes || ''; $('roadmapCatalogReferenceLink').href = referenceUrl || '#'; $('roadmapCatalogReferenceLink').hidden = !/^https?:\/\//i.test(referenceUrl); $('roadmapCatalogFormTitle').textContent = row ? row.certificationName : 'New catalog item'; $('roadmapCatalogStatus').textContent = editable ? 'Ready' : 'Read-only'; setRoadmapCatalogEditable(editable); const modal = $('roadmapCatalogModal'); if (!modal.open) modal.showModal(); }
