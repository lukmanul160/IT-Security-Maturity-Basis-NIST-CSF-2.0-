let policyKnowledgeNotes = [];
let policyRelatedSelection = new Set();
let policyKnowledgeRequest = 0;
const policyRelatedExpandedFolders = new Set(['']);
function policyRelatedFolderNotes(folder) {
  return policyKnowledgeNotes.filter(note => !folder || note.folder === folder || (note.folder || '').startsWith(folder + '/'));
}
function setPolicyRelatedFolder(folder, selected) {
  for (const note of policyRelatedFolderNotes(folder)) {
    if (selected) policyRelatedSelection.add(String(note.id));
    else policyRelatedSelection.delete(String(note.id));
  }
}
function renderPolicyRelatedNotes() {
  const container = $('policyRelatedNotes');
  if (!container) return;
  const query = ($('policyRelatedSearch')?.value || '').trim().toLowerCase();
  const matches = note => !query || [note.title, note.folder, note.content].join(' ').toLowerCase().includes(query);
  const tree = { path: '', name: 'Knowledge Vault', children: new Map(), notes: [] };
  for (const note of policyKnowledgeNotes) {
    let node = tree;
    for (const part of (note.folder || '').split('/').filter(Boolean)) {
      if (!node.children.has(part)) node.children.set(part, { path: node.path ? node.path + '/' + part : part, name: part, children: new Map(), notes: [] });
      node = node.children.get(part);
    }
    node.notes.push(note);
  }
  container.replaceChildren();
  const checkboxFor = (notes, onChange) => {
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    const count = notes.filter(note => policyRelatedSelection.has(String(note.id))).length;
    checkbox.checked = notes.length > 0 && count === notes.length;
    checkbox.indeterminate = count > 0 && count < notes.length;
    checkbox.addEventListener('change', () => { onChange(checkbox.checked); renderPolicyRelatedNotes(); });
    return checkbox;
  };
  const appendNote = (parent, note) => {
    const label = document.createElement('div'); label.className = 'policy-related-note';
    const checkbox = checkboxFor([note], selected => {
      if (selected) policyRelatedSelection.add(String(note.id)); else policyRelatedSelection.delete(String(note.id));
    });
    checkbox.setAttribute('aria-label', 'Pilih catatan ' + note.title);
    const link = document.createElement('a');
    link.href = '/app#knowledge-note=' + encodeURIComponent(note.id);
    link.target = '_blank'; link.rel = 'noopener'; link.textContent = note.title + '.md';
    label.append(checkbox, link); parent.append(label);
  };
  const appendFolder = (parent, node) => {
    const notes = policyRelatedFolderNotes(node.path);
    if (!notes.some(matches)) return;
    const details = document.createElement('details'); details.className = 'policy-related-folder';
    details.open = !!query || policyRelatedExpandedFolders.has(node.path);
    details.addEventListener('toggle', () => {
      if (query) return;
      if (details.open) policyRelatedExpandedFolders.add(node.path); else policyRelatedExpandedFolders.delete(node.path);
    });
    const summary = document.createElement('summary');
    const checkbox = checkboxFor(notes, selected => setPolicyRelatedFolder(node.path, selected));
    checkbox.setAttribute('aria-label', 'Pilih semua catatan dalam ' + (node.path || 'Knowledge Vault'));
    checkbox.addEventListener('click', event => event.stopPropagation());
    const name = document.createElement('span'); name.textContent = node.name;
    const count = document.createElement('small');
    count.textContent = notes.filter(note => policyRelatedSelection.has(String(note.id))).length + '/' + notes.length;
    summary.title = (node.path || 'Knowledge Vault') + ' ? pilih seluruh catatan termasuk subfolder';
    summary.append(checkbox, name, count); details.append(summary);
    const children = document.createElement('div'); children.className = 'policy-related-children';
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) appendFolder(children, child);
    for (const note of node.notes.sort((a, b) => a.title.localeCompare(b.title))) if (matches(note)) appendNote(children, note);
    details.append(children); parent.append(details);
  };
  appendFolder(container, tree);
  for (const id of policyRelatedSelection) {
    if (policyKnowledgeNotes.some(note => String(note.id) === id)) continue;
    const label = document.createElement('label'); label.className = 'policy-related-note';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true;
    checkbox.addEventListener('change', () => { policyRelatedSelection.delete(id); renderPolicyRelatedNotes(); });
    label.append(checkbox, 'Catatan #' + id + ' belum tersedia (hapus centang untuk melepas hubungan).'); container.append(label);
  }
  if (!container.childNodes.length) container.textContent = query ? 'Tidak ada catatan yang cocok.' : 'Tidak ada catatan tersedia.';
}
async function loadPolicyKnowledgeNotes() {
  const request = ++policyKnowledgeRequest;
  try {
    const response = await fetch('/api/knowledge-notes', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403 ? 'Akses baca Knowledge Vault diperlukan untuk memilih dan mencari isi catatan terkait.' : 'Catatan terkait gagal dimuat. Coba buka kembali policy.');
    const notes = await response.json();
    if (request !== policyKnowledgeRequest) return;
    policyKnowledgeNotes = notes;
    if ($('policyRelatedStatus')) $('policyRelatedStatus').textContent = notes.length ? 'Centang folder untuk memilih semua catatan termasuk subfolder, atau pilih catatan satu per satu.' : 'Belum ada catatan di Knowledge Vault.';
  } catch (error) {
    if (request !== policyKnowledgeRequest) return;
    policyKnowledgeNotes = [];
    if ($('policyRelatedStatus')) $('policyRelatedStatus').textContent = error.message;
  }
  renderPolicyRelatedNotes();
  renderPolicyRegisterRows();
}
$('policyRelatedSearch')?.addEventListener('input', renderPolicyRelatedNotes);
function policyRelatedMarkup(row) {
  const ids = new Set((row.relatedNoteIds || []).map(String));
  if (!ids.size) return '-';
  const notes = policyKnowledgeNotes.filter(note => ids.has(String(note.id)));
  if (!notes.length) return '<span>' + ids.size + ' catatan terkait</span>';
  const links = notes.map(note => '<div><a target="_blank" rel="noopener" title="' + escapeHtml((note.folder ? note.folder + '/' : '') + note.title + '.md') + '" href="/app#knowledge-note=' + encodeURIComponent(note.id) + '">' + escapeHtml(note.title + '.md') + '</a></div>').join('');
  return '<details class="policy-related-links"><summary>' + notes.length + ' catatan terkait</summary><div class="policy-related-link-list">' + links + '</div></details>';
}
function policySearchText(row) {
  const ids = new Set((row.relatedNoteIds || []).map(String));
  return [row.title, row.category, row.owner, row.approvalStatus, row.notes, row.attachmentName,
    ...(row.items || []).map(item => item.subtitle + ' ' + item.content),
    ...policyKnowledgeNotes.filter(note => ids.has(String(note.id))).map(note => [note.title, note.folder, note.content].join(' '))
  ].join(' ').toLowerCase();
}
function resetPolicyRegisterForm() {
  $('policyRegisterForm')?.reset();
  $('policyRegisterId').value = '';
  $('policyRegisterDelete').hidden = true;
  $('policyRegisterSubmit').textContent = 'Save policy';
  $('policyRegisterStatus').textContent = 'Ready';
  $('policyRegisterFile').value = '';
  $('policyRegisterFilePreview').hidden = true;
  $('policyRegisterFileName').textContent = '-';
  $('policyRegisterFormTitle').textContent = 'New policy';
  policyRelatedSelection = new Set();
  policyRelatedExpandedFolders.clear();
  policyRelatedExpandedFolders.add('');
  if ($('policyRelatedSearch')) $('policyRelatedSearch').value = '';
  renderPolicyRelatedNotes();
  renderPolicyRegisterItems([]);
}

function openPolicyRegisterModal(row = null) {
  if (!canManagePolicyRegister(row ? 'update' : 'create')) return;
  // Shared dialogs must remain visible when opened outside the Policy Register view.
  for (const id of ['policyRegisterModal', 'policyDropdownManagerModal']) {
    const dialog = $(id);
    if (dialog && dialog.parentElement !== document.body) document.body.appendChild(dialog);
  }
  loadPolicyDropdownOptions();
  resetPolicyRegisterForm();
  if (row) fillPolicyRegisterForm(row);
  loadPolicyKnowledgeNotes();
  $('policyRegisterModal')?.showModal();
}

function fillPolicyRegisterForm(row) {
  if (!row) return;
  policyRelatedSelection = new Set((row.relatedNoteIds || []).map(String));
  renderPolicyRelatedNotes();
  $('policyRegisterId').value = row.id;
  $('policyRegisterTitle').value = row.title || '';
  $('policyRegisterCategory').value = row.category || '';
  $('policyRegisterOwner').value = row.owner || '';
  $('policyRegisterReviewCycle').value = row.reviewCycle || '';
  $('policyRegisterApprovalStatus').value = row.approvalStatus || '';
  $('policyRegisterLastReview').value = row.lastReview ? String(row.lastReview).slice(0, 10) : '';
  $('policyRegisterNotes').value = row.notes || '';
  $('policyRegisterDelete').hidden = !canManagePolicyRegister('delete');
  $('policyRegisterSubmit').textContent = 'Update policy';
  $('policyRegisterFormTitle').textContent = `Update ${row.title || 'policy'}`;
  $('policyRegisterStatus').textContent = `Editing ${row.title || 'policy'}`;
  renderPolicyRegisterItems(row.items || []);
  if (row.attachmentName && row.attachmentPath) {
    $('policyRegisterFilePreview').hidden = false;
    $('policyRegisterFileName').textContent = row.attachmentName;
  } else {
    $('policyRegisterFilePreview').hidden = true;
  }
}

function renderPolicyRegisterItems(items = []) {
  const container = $('policyRegisterItems');
  if (!container) return;
  const rows = items.length ? items : [{}];
  container.innerHTML = rows.map((item, index) => `
    <div class="policy-item-row" data-policy-item-id="${item.id || ''}">
      <label>Subtitle<input name="policy-item-${index}-subtitle" type="text" data-policy-item-subtitle value="${escapeHtml(item.subtitle || '')}" maxlength="200"></label>
      <label>Content<textarea name="policy-item-${index}-content" data-policy-item-content rows="3" maxlength="5000">${escapeHtml(item.content || '')}</textarea></label>
      <button class="attachment-action-button danger" type="button" data-policy-item-remove${rows.length === 1 ? ' hidden' : ''}>Remove</button>
    </div>
  `).join('');
}

function getPolicyRegisterItems() {
  return [...document.querySelectorAll('#policyRegisterItems .policy-item-row')]
    .map(row => ({
      id: row.dataset.policyItemId || null,
      subtitle: row.querySelector('[data-policy-item-subtitle]')?.value.trim() || '',
      content: row.querySelector('[data-policy-item-content]')?.value.trim() || '',
    }))
    .filter(item => item.subtitle || item.content);
}

