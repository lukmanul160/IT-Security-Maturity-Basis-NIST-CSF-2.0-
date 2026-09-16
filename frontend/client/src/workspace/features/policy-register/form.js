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
  $('policyRegisterModal')?.showModal();
}

function fillPolicyRegisterForm(row) {
  if (!row) return;
  $('policyRegisterId').value = row.id;
  $('policyRegisterTitle').value = row.title || '';
  $('policyRegisterCategory').value = row.category || '';
  $('policyRegisterOwner').value = row.owner || '';
  $('policyRegisterReviewCycle').value = row.reviewCycle || '';
  $('policyRegisterApprovalStatus').value = row.approvalStatus || '';
  $('policyRegisterLastReview').value = row.lastReview ? String(row.lastReview).slice(0, 10) : '';
  $('policyRegisterNotes').value = row.notes || '';
  $('policyRegisterDelete').hidden = false;
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
      <label>Subtitle<input type="text" data-policy-item-subtitle value="${escapeHtml(item.subtitle || '')}" maxlength="200"></label>
      <label>Content<textarea data-policy-item-content rows="3" maxlength="5000">${escapeHtml(item.content || '')}</textarea></label>
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

