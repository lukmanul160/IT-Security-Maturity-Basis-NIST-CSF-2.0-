// The server supplies an uploader-scoped library; never derive picker options from shared assessments.
let evidenceLibrary = [];
let evidenceLibraryPending = null;
function selectableEvidenceRecords() { return evidenceLibrary; }
function updateEvidencePicker(picker, html) {
  if (!picker) return;
  const input = picker.querySelector('input[type="search"]');
  const focused = input && document.activeElement === input;
  const selection = input ? [input.selectionStart, input.selectionEnd] : null;
  picker.innerHTML = html;
  if (focused) {
    const replacement = picker.querySelector('input[type="search"]');
    replacement?.focus({ preventScroll: true });
    if (selection) replacement?.setSelectionRange(...selection);
  }
}
async function refreshEvidenceLibrary() {
  if (evidenceLibraryPending) return evidenceLibraryPending;
  evidenceLibraryPending = (async () => {
    try {
      const response = await fetch('/api/files?details=true');
      if (!response.ok) throw new Error('Daftar evidence tidak dapat dimuat.');
      const records = await response.json();
      if (!Array.isArray(records) || records.some(file => typeof file?.path !== 'string' || typeof file?.name !== 'string')) throw new Error('Daftar evidence tidak valid. Muat ulang server dan halaman.');
      evidenceLibrary = records;
    } catch (error) { evidenceLibrary = []; $('saveState').textContent = error.message; }
    finally { evidenceLibraryPending = null; }
    document.querySelectorAll('[data-existing-picker]').forEach(picker => updateEvidencePicker(picker, existingFilePicker(picker.dataset.existingPicker, picker.querySelector('input')?.value || '')));
    document.querySelectorAll('[data-privacy-existing-picker]').forEach(picker => updateEvidencePicker(picker, privacyFilePicker(picker.dataset.privacyExistingPicker, picker.querySelector('input')?.value || '')));
    document.querySelectorAll('[data-iso-existing-picker]').forEach(picker => updateEvidencePicker(picker, isoEvidencePicker(picker.dataset.isoExistingPicker, picker.querySelector('input')?.value || '')));
    if (typeof renderUploadedFiles === 'function') renderUploadedFiles();
    return evidenceLibrary;
  })();
  return evidenceLibraryPending;
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-toggle-existing], [data-toggle-privacy-existing], [data-toggle-iso-existing], [data-view="files"]')) void refreshEvidenceLibrary();
});
fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(user => {
  if (user && (user.role === 'admin' || user.permissions?.includes('files'))) return refreshEvidenceLibrary();
}).catch(() => {});

const evidenceEditPermission = new Map();
function attachmentPathForActions(item) {
  const named = item.querySelector('.attachment-name[title]');
  if (named?.title) return named.title;
  const link = item.querySelector('a.list-evidence-name[href]');
  if (!link) return '';
  const marker = '/api/files/';
  const href = link.getAttribute('href') || '';
  const index = href.indexOf(marker);
  return index < 0 ? '' : decodeURIComponent(href.slice(index + marker.length)).replace(/^open\//, '');
}
function addPdfOpenPageAction(item, filePath) {
  const name = item.querySelector('.attachment-name, .list-evidence-name')?.textContent || filePath;
  if (!/\.pdf(?:$|[?#])/i.test(`${name} ${filePath}`) || item.querySelector('[data-set-pdf-open-page]')) return;
  const actions = item.querySelector('.attachment-actions');
  if (!actions) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'attachment-action-button'; button.dataset.setPdfOpenPage = filePath; button.textContent = 'Halaman PDF';
  button.addEventListener('click', async () => {
    const pageResponse = await fetch(`/api/files/open-page/${filePath.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`);
    const current = pageResponse.ok ? await pageResponse.json().catch(() => ({})) : {};
    const value = window.prompt('Buka PDF mulai halaman nomor:', String(Math.max(1, Number(current.openPage) || 1)));
    if (value === null) return;
    const openPage = Number(value);
    if (!Number.isInteger(openPage) || openPage < 1) { $('saveState').textContent = 'Nomor halaman PDF harus minimal 1.'; return; }
    const response = await fetch(`/api/files/open-page/${filePath.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openPage }) });
    const result = await response.json().catch(() => ({}));
    $('saveState').textContent = response.ok ? `PDF akan dibuka pada halaman ${result.openPage}.` : (result.error || 'Halaman PDF gagal disimpan.');
  });
  actions.prepend(button);
}
function hideEvidenceEditActions(item, canModify, filePath) {
  item.dataset.evidenceEditable = canModify ? 'true' : 'false';
  if (canModify) addPdfOpenPageAction(item, filePath);
}
async function setEvidenceEditPermissions() {
  const items = [...document.querySelectorAll('.attachment-item, .list-evidence-file')];
  await Promise.all(items.map(async item => {
    if (item.dataset.evidenceEditable) return;
    const filePath = attachmentPathForActions(item);
    if (!filePath) return;
    item.dataset.evidenceEditable = 'checking';
    if (!evidenceEditPermission.has(filePath)) evidenceEditPermission.set(filePath, fetch(`/api/files/access/${filePath.split('/').map(encodeURIComponent).join('/')}`).then(response => response.ok ? response.json() : { canModify: false }).then(result => Boolean(result.canModify)).catch(() => false));
    hideEvidenceEditActions(item, await evidenceEditPermission.get(filePath), filePath);
  }));
}
const evidenceActionObserver = new MutationObserver(() => { void setEvidenceEditPermissions(); });
evidenceActionObserver.observe(document.body, { childList: true, subtree: true });
void setEvidenceEditPermissions();
