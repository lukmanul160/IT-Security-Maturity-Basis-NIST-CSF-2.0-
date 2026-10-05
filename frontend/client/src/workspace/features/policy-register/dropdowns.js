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
  if (!canManagePolicyRegister('create')) return;
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
  } catch (error) { $('saveState').textContent = error.message; }
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
let policyDropdownEditingOriginals = [];

function openPolicyDropdownManager(key) {
  policyDropdownManagerKey = key;
  policyDropdownEditingOptions = [...getPolicyDropdownOptions(key)];
  policyDropdownEditingOriginals = [...policyDropdownEditingOptions];
  
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
      <input name="option-index-${idx}" type="text" value="${escapeHtml(opt)}" data-option-index="${idx}" class="policy-dropdown-option-input">
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
      if (idx >= 0 && canManagePolicyRegister('delete')) { policyDropdownEditingOptions.splice(idx, 1); policyDropdownEditingOriginals.splice(idx, 1); }
      renderPolicyDropdownOptions();
    });
  });
}

function addPolicyDropdownOption() {
  if (!canManagePolicyRegister('create')) return;
  const input = $('policyDropdownNewOption');
  const value = input?.value.trim();
  if (!value) return;
  
  if (!policyDropdownEditingOptions.includes(value)) {
    policyDropdownEditingOptions.push(value);
    policyDropdownEditingOriginals.push(null);
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

    if (!response.ok) throw new Error('Daftar pilihan gagal dimuat.');
    const planned = filtered.map((value,index) => {
      const original=policyDropdownEditingOriginals[policyDropdownEditingOptions.indexOf(value)];
      const record=currentField.find(item=>(item.optionValue || item.option_value)===original);
      return {value,index,record};
    });
    const retained=new Set(planned.filter(item=>item.record).map(item=>item.record.id));
    const operations=currentField.filter(item=>!retained.has(item.id)).map(item=>({action:'delete',url:'/api/policy-register/dropdowns/'+item.id,method:'DELETE'}));
    for(const {value,index,record} of planned) {
      if(record && value===(record.optionValue || record.option_value))continue;
      operations.push({action:record?'update':'create',url:'/api/policy-register/dropdowns'+(record?'/'+record.id:''),method:record?'PUT':'POST',data:{fieldName,optionValue:value,sortOrder:index}});
    }
    for(const operation of operations) if(!canManagePolicyRegister(operation.action)) throw new Error('Izin '+operation.action+' diperlukan untuk perubahan pilihan ini.');
    for(const operation of operations) {
      const saved=await fetch(operation.url,{method:operation.method,...(operation.data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(operation.data)}:{})});
      if(!saved.ok)throw new Error((await saved.json().catch(()=>({}))).error || 'Pilihan gagal disimpan.');
    }

    const list = filtered.slice();
    policyDropdownState[fieldName] = list;
    localStorage.setItem(`policyDropdown_${fieldName}`, JSON.stringify(list));
  } catch (error) { $('saveState').textContent=error.message; return; }

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


