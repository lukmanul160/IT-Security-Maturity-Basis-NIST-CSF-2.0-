function getPolicyDropdownOptions(key) {
  if (policyDropdownState[key] && policyDropdownState[key].length) return [...policyDropdownState[key]];
  const stored = localStorage.getItem(`policyDropdown_${key}`);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {
      return policyDropdownDefaults[key] || [];
    }
  }
  return [...(policyDropdownDefaults[key] || [])];
}

async function loadPolicyDropdownOptionsFromServer() {
  try {
    const response = await fetch('/api/policy-register/dropdowns', { cache: 'no-store' });
    if (!response.ok) return;
    const rows = await response.json();
    const grouped = {};
    for (const entry of rows || []) {
      const fieldName = entry.fieldName || entry.field_name;
      if (!fieldName) continue;
      const optionValue = entry.optionValue || entry.option_value;
      if (!optionValue) continue;
      grouped[fieldName] = [...(grouped[fieldName] || []), optionValue];
    }
    Object.keys(policyDropdownState).forEach(key => {
      const values = grouped[key] || policyDropdownDefaults[key] || [];
      policyDropdownState[key] = [...new Set(values)];
      localStorage.setItem(`policyDropdown_${key}`, JSON.stringify(policyDropdownState[key]));
    });
    updatePolicySelectOptions('categories', 'policyRegisterCategory', 'Select category');
    updatePolicySelectOptions('owners', 'policyRegisterOwner', 'Select owner');
    updatePolicySelectOptions('reviewCycles', 'policyRegisterReviewCycle', 'Select review cycle');
    updatePolicySelectOptions('approvalStatuses', 'policyRegisterApprovalStatus', 'Select approval status');
    updatePolicyDatalist('categories', 'policyCategories');
    updatePolicyDatalist('owners', 'policyOwners');
    updatePolicyDatalist('reviewCycles', 'policyReviewCycles');
    updatePolicyDatalist('approvalStatuses', 'policyApprovalStatuses');
  } catch (error) {
    console.warn('Unable to load policy dropdowns from server', error);
  }
}

async function savePolicyDropdownOption(key, value) {
  if (!value || !value.trim()) return;
  const normalized = value.trim();
  const current = getPolicyDropdownOptions(key);
  if (current.includes(normalized)) return;

  try {
    const response = await fetch('/api/policy-register/dropdowns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName: key, optionValue: normalized, sortOrder: current.length })
    });
    if (!response.ok) throw new Error('Save policy dropdown failed');
    current.push(normalized);
    policyDropdownState[key] = current;
    localStorage.setItem(`policyDropdown_${key}`, JSON.stringify(current));
    updatePolicyDatalist(key, {
      categories: 'policyCategories',
      owners: 'policyOwners',
      reviewCycles: 'policyReviewCycles',
      approvalStatuses: 'policyApprovalStatuses'
    }[key]);
  } catch (error) {
    console.warn('Falling back to local storage for policy dropdown', error);
    current.push(normalized);
    policyDropdownState[key] = current;
    localStorage.setItem(`policyDropdown_${key}`, JSON.stringify(current));
    updatePolicyDatalist(key, {
      categories: 'policyCategories',
      owners: 'policyOwners',
      reviewCycles: 'policyReviewCycles',
      approvalStatuses: 'policyApprovalStatuses'
    }[key]);
  }
}

function updatePolicyDatalist(key, datalistId) {
  const datalist = $(datalistId);
  if (!datalist) return;
  const options = getPolicyDropdownOptions(key);
  datalist.innerHTML = options.map(opt => `<option value="${escapeHtml(opt)}"/>`).join('');
}

function updatePolicySelectOptions(key, selectId, placeholder) {
  const select = $(selectId);
  if (!select) return;
  const options = getPolicyDropdownOptions(key);
  const selected = select.value || '';
  select.innerHTML = `<option value="">${placeholder}</option>${options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}`;
  if (selected && options.includes(selected)) {
    select.value = selected;
  } else {
    select.value = '';
  }
}

function loadPolicyDropdownOptions() {
  updatePolicySelectOptions('categories', 'policyRegisterCategory', 'Select category');
  updatePolicySelectOptions('owners', 'policyRegisterOwner', 'Select owner');
  updatePolicySelectOptions('reviewCycles', 'policyRegisterReviewCycle', 'Select review cycle');
  updatePolicySelectOptions('approvalStatuses', 'policyRegisterApprovalStatus', 'Select approval status');
  updatePolicyDatalist('categories', 'policyCategories');
  updatePolicyDatalist('owners', 'policyOwners');
  updatePolicyDatalist('reviewCycles', 'policyReviewCycles');
  updatePolicyDatalist('approvalStatuses', 'policyApprovalStatuses');
  loadPolicyDropdownOptionsFromServer().catch(() => {});
}

let policyDropdownManagerKey = null;
let policyDropdownEditingOptions = [];

function openPolicyDropdownManager(key) {
  policyDropdownManagerKey = key;
  policyDropdownEditingOptions = [...getPolicyDropdownOptions(key)];
  
  const labels = {
    categories: 'Categories',
    owners: 'Owners',
    reviewCycles: 'Review Cycles',
    approvalStatuses: 'Approval Statuses'
  };
  
  $('policyDropdownManagerTitle').textContent = labels[key] || key;
  $('policyDropdownNewOption').value = '';
  renderPolicyDropdownOptions();
  $('policyDropdownManagerModal')?.showModal();
}

function renderPolicyDropdownOptions() {
  const container = $('policyDropdownOptionsList');
  if (!container) return;
  
  container.innerHTML = policyDropdownEditingOptions.map((opt, idx) => `
    <div class="dropdown-option-item">
      <input type="text" value="${escapeHtml(opt)}" data-option-index="${idx}" class="policy-dropdown-option-input">
      <button type="button" class="dropdown-option-delete" data-delete-index="${idx}">Delete</button>
    </div>
  `).join('');
  
  container.querySelectorAll('.policy-dropdown-option-input').forEach(input => {
    input.addEventListener('change', () => {
      const idx = Number(input.dataset.optionIndex);
      if (idx >= 0) policyDropdownEditingOptions[idx] = input.value.trim() || policyDropdownEditingOptions[idx];
    });
  });
  
  container.querySelectorAll('.dropdown-option-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.deleteIndex);
      if (idx >= 0) policyDropdownEditingOptions.splice(idx, 1);
      renderPolicyDropdownOptions();
    });
  });
}

function addPolicyDropdownOption() {
  const input = $('policyDropdownNewOption');
  const value = input?.value.trim();
  if (!value) return;
  
  if (!policyDropdownEditingOptions.includes(value)) {
    policyDropdownEditingOptions.push(value);
    input.value = '';
    renderPolicyDropdownOptions();
  }
}

async function savePolicyDropdownOptions() {
  if (!policyDropdownManagerKey) return;
  const fieldName = policyDropdownManagerKey;
  const filtered = [...new Set(policyDropdownEditingOptions.map(opt => String(opt || '').trim()).filter(Boolean))];

  try {
    const response = await fetch('/api/policy-register/dropdowns', { cache: 'no-store' });
    const existing = response.ok ? await response.json() : [];
    const currentField = (existing || []).filter(item => (item.fieldName || item.field_name) === fieldName);
    const keepValueMap = new Map(currentField.map(item => [(item.optionValue || item.option_value), item.id]));

    for (const item of currentField) {
      const value = item.optionValue || item.option_value;
      if (!filtered.includes(value)) {
        await fetch(`/api/policy-register/dropdowns/${item.id}`, { method: 'DELETE' });
      }
    }

    for (let index = 0; index < filtered.length; index += 1) {
      const value = filtered[index];
      const existingId = keepValueMap.get(value);
      if (existingId) {
        await fetch(`/api/policy-register/dropdowns/${existingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldName, optionValue: value, sortOrder: index })
        });
      } else {
        await fetch('/api/policy-register/dropdowns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldName, optionValue: value, sortOrder: index })
        });
      }
    }

    const list = filtered.slice();
    policyDropdownState[fieldName] = list;
    localStorage.setItem(`policyDropdown_${fieldName}`, JSON.stringify(list));
  } catch (error) {
    policyDropdownState[fieldName] = filtered;
    localStorage.setItem(`policyDropdown_${fieldName}`, JSON.stringify(filtered));
    console.warn('Unable to persist policy dropdown to server, saved locally', error);
  }

  const datalistMap = {
    categories: 'policyCategories',
    owners: 'policyOwners',
    reviewCycles: 'policyReviewCycles',
    approvalStatuses: 'policyApprovalStatuses'
  };

  updatePolicySelectOptions(policyDropdownManagerKey, {
    categories: 'policyRegisterCategory',
    owners: 'policyRegisterOwner',
    reviewCycles: 'policyRegisterReviewCycle',
    approvalStatuses: 'policyRegisterApprovalStatus'
  }[policyDropdownManagerKey], {
    categories: 'Select category',
    owners: 'Select owner',
    reviewCycles: 'Select review cycle',
    approvalStatuses: 'Select approval status'
  }[policyDropdownManagerKey]);
  updatePolicyDatalist(policyDropdownManagerKey, datalistMap[policyDropdownManagerKey]);
}


