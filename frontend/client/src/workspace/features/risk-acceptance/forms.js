function setRiskAcceptanceEditable(editable) { $('riskAcceptanceForm').querySelectorAll('input, textarea, select').forEach(element => { if (element.id !== 'riskAcceptanceId') element.disabled = !editable; }); $('riskAcceptanceSubmit').disabled = !editable; $('riskAcceptanceCancel').disabled = false; $('riskAcceptanceSubmit').hidden = !editable; $('riskAcceptanceCancel').hidden = false; }
function resetRiskAcceptanceForm() { $('riskAcceptanceForm').reset(); $('riskAcceptanceId').value = ''; setRiskAcceptanceEditable(true); $('riskAcceptanceSubmit').textContent = 'Save risk acceptance form'; $('riskAcceptanceStatus').textContent = 'New form'; $('riskAcceptanceFormStatus').textContent = 'Ready'; }
function riskDate(value) { return value ? String(value).slice(0, 10) : ''; }
function riskFormData() { return { requestorName: $('riskRequestorName').value, assetName: $('riskAssetName').value, department: $('riskDepartment').value, previouslyAccepted: $('riskPreviouslyAccepted').checked, riskDescription: $('riskDescription').value, benefitJustification: $('riskBenefitJustification').value, mitigationPlan: $('riskMitigationPlan').value, businessOwnerDecision: $('riskBusinessOwnerDecision').value, remediationDate: $('riskRemediationDate').value, requestorPrintName: $('riskRequestorPrintName').value, requestorEmailPhone: $('riskRequestorEmailPhone').value, requestorSignature: $('riskRequestorSignature').value, requestorDate: $('riskRequestorDate').value, cioComments: $('riskCioComments').value, cioName: $('riskCioName').value, cioSignature: $('riskCioSignature').value, cioDate: $('riskCioDate').value, cisDecision: $('riskCisDecision').value, cisReason: $('riskCisReason').value, cisConditions: $('riskCisConditions').value, cisName: $('riskCisName').value, cisSignature: $('riskCisSignature').value, cisDate: $('riskCisDate').value }; }
function fillRiskAcceptanceForm(form) { setRiskAcceptanceEditable(true); $('riskAcceptanceId').value = form.id; $('riskRequestorName').value = form.requestorName; $('riskAssetName').value = form.assetName; $('riskDepartment').value = form.department; $('riskPreviouslyAccepted').checked = form.previouslyAccepted; $('riskDescription').value = form.riskDescription; $('riskBenefitJustification').value = form.benefitJustification; $('riskMitigationPlan').value = form.mitigationPlan; $('riskBusinessOwnerDecision').value = form.businessOwnerDecision; $('riskRemediationDate').value = riskDate(form.remediationDate); $('riskRequestorPrintName').value = form.requestorPrintName; $('riskRequestorEmailPhone').value = form.requestorEmailPhone; $('riskRequestorSignature').value = form.requestorSignature; $('riskRequestorDate').value = riskDate(form.requestorDate); $('riskCioComments').value = form.cioComments; $('riskCioName').value = form.cioName; $('riskCioSignature').value = form.cioSignature; $('riskCioDate').value = riskDate(form.cioDate); $('riskCisDecision').value = form.cisDecision; $('riskCisReason').value = form.cisReason; $('riskCisConditions').value = form.cisConditions; $('riskCisName').value = form.cisName; $('riskCisSignature').value = form.cisSignature; $('riskCisDate').value = riskDate(form.cisDate); $('riskAcceptanceSubmit').textContent = 'Update risk acceptance form'; $('riskAcceptanceStatus').textContent = `Editing form #${form.id}`; $('riskAcceptanceFormStatus').textContent = 'Ready'; openRiskAcceptanceModal('Edit Risk Acceptance'); }
function viewRiskAcceptanceForm(form) { fillRiskAcceptanceForm(form); setRiskAcceptanceEditable(false); $('riskAcceptanceModalTitle').textContent = 'Detail Risk Acceptance'; $('riskAcceptanceStatus').textContent = `Viewing form #${form.id}`; }
function renderRiskAcceptanceForms() { renderRiskAcceptanceDashboard(); const body = $('riskAcceptanceBody'); if (!body) return; $('riskAcceptanceCount').textContent = `${riskAcceptanceForms.length} form${riskAcceptanceForms.length === 1 ? '' : 's'}`; riskAcceptancePage = renderListPagination('riskAcceptancePagination', riskAcceptancePage, riskAcceptanceForms.length, 'forms'); const visible = riskAcceptanceForms.slice((riskAcceptancePage - 1) * 20, riskAcceptancePage * 20); body.innerHTML = visible.map(form => `<tr><td>${escapeHtml(form.requestorName)}</td><td>${escapeHtml(form.assetName)}</td><td>${escapeHtml(form.department)}</td><td>${escapeHtml(form.businessOwnerDecision)}</td><td>${escapeHtml(form.cisDecision)}</td><td>${riskDate(form.updatedAt)}</td><td><button class="attachment-action-button" type="button" data-risk-view="${form.id}">View</button><button class="attachment-action-button" type="button" data-risk-edit="${form.id}">Edit</button><button class="attachment-action-button" type="button" data-risk-pdf="${form.id}">PDF</button><button class="attachment-action-button danger" type="button" data-risk-delete="${form.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7">No risk acceptance forms found.</td></tr>'; }
async function loadRiskAcceptanceForms() { const response = await fetch('/api/risk-acceptance', { cache: 'no-store' }); if (!response.ok) throw new Error('Risk acceptance data unavailable'); riskAcceptanceForms = await response.json(); renderRiskAcceptanceForms(); }
async function saveRiskAcceptanceForm(event) {
  event.preventDefault();
  const id = $('riskAcceptanceId').value;
  const button = $('riskAcceptanceSubmit');
  if (button.disabled) return;
  button.disabled = true;
  $('riskAcceptanceFormStatus').textContent = 'Menyimpan...';
  try {
    const response = await fetch(id ? `/api/risk-acceptance/${encodeURIComponent(id)}` : '/api/risk-acceptance', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(riskFormData()) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Gagal menyimpan data.'); }
    $('riskAcceptanceModal').close();
    resetRiskAcceptanceForm();
    $('riskAcceptancePageStatus').textContent = id ? 'Data berhasil diperbarui.' : 'Data berhasil ditambahkan.';
    await loadRiskAcceptanceForms().catch(() => { $('riskAcceptancePageStatus').textContent = 'Data tersimpan, tetapi daftar gagal dimuat ulang. Muat ulang halaman.'; });
  } catch (error) { $('riskAcceptanceFormStatus').textContent = error.message; }
  finally { button.disabled = false; }
}
function deleteRiskAcceptanceForm(id) {
  const form = riskAcceptanceForms.find(item => String(item.id) === String(id));
  if (!form) return;
  $('riskAcceptanceDeleteConfirm').dataset.id = id;
  $('riskAcceptanceDeleteMessage').textContent = `Hapus risk acceptance untuk ${form.assetName} oleh ${form.requestorName}? Data yang dihapus tidak dapat dikembalikan.`;
  $('riskAcceptanceDeleteStatus').textContent = '';
  $('riskAcceptanceDeleteModal').showModal();
}
async function confirmDeleteRiskAcceptance() {
  const button = $('riskAcceptanceDeleteConfirm');
  if (button.disabled) return;
  button.disabled = true;
  $('riskAcceptanceDeleteStatus').textContent = 'Menghapus...';
  try {
    const response = await fetch(`/api/risk-acceptance/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Gagal menghapus data. Silakan coba lagi.');
    $('riskAcceptanceDeleteModal').close();
    $('riskAcceptancePageStatus').textContent = 'Data berhasil dihapus.';
    await loadRiskAcceptanceForms().catch(() => { $('riskAcceptancePageStatus').textContent = 'Data dihapus, tetapi daftar gagal dimuat ulang. Muat ulang halaman.'; });
  } catch (error) { $('riskAcceptanceDeleteStatus').textContent = error.message; }
  finally { button.disabled = false; }
}
function openRiskAcceptanceModal(title) {
  $('riskAcceptanceModalTitle').textContent = title;
  const modal = $('riskAcceptanceModal');
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}
function selectRiskAcceptanceTab(tab) {
  document.querySelectorAll('[data-risk-acceptance-tab]').forEach(button => {
    const selected = button.dataset.riskAcceptanceTab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.classList.toggle('button-accent', selected);
    button.classList.toggle('button-quiet', !selected);
    $(button.getAttribute('aria-controls')).hidden = !selected;
  });
}
function renderRiskAcceptanceDashboard() {
  const denied = form => form.businessOwnerDecision === 'denied' || form.cisDecision === 'denied';
  $('riskAcceptanceTotal').textContent = riskAcceptanceForms.length;
  $('riskAcceptanceApproved').textContent = riskAcceptanceForms.filter(form => !denied(form) && form.cisDecision === 'approved').length;
  $('riskAcceptanceConditional').textContent = riskAcceptanceForms.filter(form => !denied(form) && form.cisDecision === 'conditional').length;
  $('riskAcceptanceDenied').textContent = riskAcceptanceForms.filter(denied).length;
}
function showRiskAcceptanceView() { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('riskAcceptanceView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'risk-acceptance')); renderRiskAcceptanceForms(); saveUiState('risk-acceptance'); }
let policyRegisterRows = [];
const policyDropdownDefaults = {
  categories: ['Cybersecurity', 'IT Governance', 'Privacy', 'Risk Management', 'HR & Compliance'],
  owners: ['CISO', 'IT Manager', 'Data Protection Officer', 'Security Manager', 'Legal', 'Procurement'],
  reviewCycles: ['Annual', 'Biannual', 'Quarterly', 'Ad hoc'],
  approvalStatuses: ['Approved', 'Draft', 'Review due', 'Expired'],
};

const policyDropdownState = {
  categories: [...(policyDropdownDefaults.categories || [])],
  owners: [...(policyDropdownDefaults.owners || [])],
  reviewCycles: [...(policyDropdownDefaults.reviewCycles || [])],
  approvalStatuses: [...(policyDropdownDefaults.approvalStatuses || [])],
};

