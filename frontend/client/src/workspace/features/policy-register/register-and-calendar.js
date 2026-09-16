function getPolicyReviewCycleMonths(reviewCycle) {
  const value = String(reviewCycle || '').trim().toLowerCase();
  if (value === 'annual') return 12;
  if (value === 'biannual') return 6;
  if (value === 'quarterly') return 3;
  if (value === 'ad hoc' || value === 'ad hoc review' || value === 'ad-hoc') return 0;
  return null;
}

function getPolicyNextReviewDate(row) {
  const reviewDate = row.lastReview || row.last_review || null;
  const cycle = row.reviewCycle || row.review_cycle || '';
  const months = getPolicyReviewCycleMonths(cycle);
  if (!reviewDate || months === null || months === 0) return null;

  const start = new Date(`${String(reviewDate).slice(0, 10)}T00:00:00Z`);
  const next = new Date(start);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next.toISOString().slice(0, 10);
}

function renderPolicyReviewCalendar() {
  const body = $('policyReviewCalendarBody');
  const grid = $('policyReviewCalendarGrid');
  const title = $('policyReviewCalendarMonthTitle');
  const monthFilter = $('policyReviewCalendarMonthFilter');
  if (!body) return;

  const monthOptions = [...new Set(policyRegisterRows
    .map(row => getPolicyNextReviewDate(row))
    .filter(Boolean)
    .map(date => new Date(`${date}T00:00:00Z`).toISOString().slice(0, 7))
  )].sort();

  if (monthFilter) {
    const selected = monthFilter.value;
    const options = ['<option value="all">All months</option>']
      .concat(monthOptions.map(month => `<option value="${month}">${new Date(`${month}-01T00:00:00Z`).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</option>`));
    monthFilter.innerHTML = options.join('');
    const currentMonth = policyReviewCalendarDate.toISOString().slice(0, 7);
    monthFilter.value = monthOptions.includes(selected) ? selected : monthOptions.includes(currentMonth) ? currentMonth : 'all';
    if (monthFilter.value !== 'all') {
      const [year, month] = monthFilter.value.split('-').map(Number);
      policyReviewCalendarDate = new Date(Date.UTC(year, month - 1, 1));
    }
  }

  const items = policyRegisterRows
    .map(row => {
      const nextReviewDate = getPolicyNextReviewDate(row);
      if (!nextReviewDate) return null;
      const today = new Date();
      const start = new Date(`${nextReviewDate}T00:00:00Z`);
      const diffDays = Math.ceil((start.getTime() - today.getTime()) / 86400000);
      return { ...row, nextReviewDate, diffDays };
    })
    .filter(Boolean)
    .filter(item => {
      if (!monthFilter || !monthFilter.value || monthFilter.value === 'all') return true;
      return item.nextReviewDate.startsWith(monthFilter.value);
    })
    .sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));

  if (grid) {
    const year = policyReviewCalendarDate.getUTCFullYear();
    const month = policyReviewCalendarDate.getUTCMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysInPreviousMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const eventsByDate = {};
    items.forEach(item => {
      if (!item.nextReviewDate.startsWith(monthKey)) return;
      (eventsByDate[item.nextReviewDate] ||= []).push(item);
    });
    const cells = [];
    for (let index = 0; index < firstDay; index += 1) {
      const date = daysInPreviousMonth - firstDay + index + 1;
      cells.push(`<div class="policy-calendar-day is-outside"><span class="policy-calendar-date">${date}</span></div>`);
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    for (let date = 1; date <= daysInMonth; date += 1) {
      const dateKey = `${monthKey}-${String(date).padStart(2, '0')}`;
      const events = eventsByDate[dateKey] || [];
      const eventMarkup = events.map(item => {
        const status = item.diffDays < 0 ? 'Overdue' : item.diffDays <= 30 ? 'Due soon' : 'Scheduled';
        const statusClass = status === 'Due soon' ? 'warning' : status === 'Overdue' ? 'danger' : '';
        return `<span class="policy-calendar-event ${statusClass}" title="${escapeHtml(item.title || '-')}">${escapeHtml(item.title || '-')}</span>`;
      }).join('');
      cells.push(`<div class="policy-calendar-day${dateKey === todayKey ? ' is-today' : ''}"><span class="policy-calendar-date">${date}</span>${eventMarkup}</div>`);
    }
    const trailingDays = (7 - (cells.length % 7)) % 7;
    for (let date = 1; date <= trailingDays; date += 1) {
      cells.push(`<div class="policy-calendar-day is-outside"><span class="policy-calendar-date">${date}</span></div>`);
    }
    grid.innerHTML = cells.join('') || '<div class="policy-calendar-empty">No calendar dates available.</div>';
    if (title) title.textContent = policyReviewCalendarDate.toLocaleString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  body.innerHTML = items.map(item => {
    const status = item.diffDays < 0 ? 'Overdue' : item.diffDays <= 30 ? 'Due soon' : 'Scheduled';
    return `
      <tr>
        <td>${escapeHtml(item.title || '-')}</td>
        <td>${escapeHtml(item.owner || '-')}</td>
        <td>${escapeHtml(item.reviewCycle || '-')}</td>
        <td>${item.lastReview ? new Date(`${item.lastReview}T00:00:00Z`).toLocaleDateString('id-ID') : '-'}</td>
        <td>${new Date(`${item.nextReviewDate}T00:00:00Z`).toLocaleDateString('id-ID')}</td>
        <td><span class="status-chip ${status === 'Due soon' ? 'warning' : status === 'Overdue' ? 'danger' : 'ok'}">${status}</span></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6">No policy review dates available.</td></tr>';
}

function renderPolicyRegisterRows() {
  const rows = policyRegisterRows.slice();
  const total = rows.length;
  const approved = rows.filter(row => String(row.approvalStatus || '').toLowerCase() === 'approved').length;
  const due = rows.filter(row => String(row.approvalStatus || '').toLowerCase() === 'review due').length;
  const owners = new Set(rows.map(row => row.owner).filter(Boolean)).size;

  $('policyRegisterCount').textContent = `${total} policy${total === 1 ? '' : 'ies'}`;
  $('policyRegisterTotalValue').textContent = total;
  $('policyRegisterApprovedValue').textContent = approved;
  $('policyRegisterDueValue').textContent = due;
  $('policyRegisterOwnerValue').textContent = owners;

  renderPolicySummaries(rows);
  updatePolicyFilters(rows);
  renderPolicyReviewCalendar();

  const body = $('policyRegisterBody');
  if (!body) return;
  body.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.title || '-')}</td>
      <td>${escapeHtml(row.category || '-')}</td>
      <td>${escapeHtml(row.owner || '-')}</td>
      <td>${escapeHtml(row.reviewCycle || '-')}</td>
      <td>${escapeHtml(row.approvalStatus || '-')}</td>
      <td>${row.lastReview ? new Date(row.lastReview).toLocaleDateString('id-ID') : '-'}</td>
      <td>${row.attachmentName ? `<a href="/api/files/${encodeURIComponent(String(row.attachmentPath || '').replace(/^upload\//, ''))}" target="_blank" rel="noreferrer">${escapeHtml(row.attachmentName)}</a>` : '-'}</td>
      <td>${canManagePolicyRegister('update') ? `<button class="attachment-action-button" type="button" data-policy-edit="${row.id}">Edit</button>` : ''}${canManagePolicyRegister('delete') ? `<button class="attachment-action-button danger" type="button" data-policy-delete="${row.id}">Delete</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="8">No policy records found.</td></tr>';
}

function renderPolicySummaries(rows) {
  const statusCounts = {};
  const reviewCycleCounts = {};
  const ownerCounts = {};

  rows.forEach(row => {
    const status = row.approvalStatus || 'Unassigned';
    const cycle = row.reviewCycle || 'Not set';
    const owner = row.owner || 'Unassigned';
    
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    reviewCycleCounts[cycle] = (reviewCycleCounts[cycle] || 0) + 1;
    ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
  });

  const renderSummaryList = (counts) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `
        <div class="risk-summary-row">
          <span>${escapeHtml(name)}</span>
          <strong>${count}</strong>
          <i><b style="width: ${Math.round((count / total) * 100)}%"></b></i>
        </div>
      `).join('');
  };

  const statusList = $('policyStatusSummary');
  if (statusList) statusList.innerHTML = renderSummaryList(statusCounts) || '<span style="color: var(--muted); font-size: 11px;">No data available</span>';

  const reviewList = $('policyReviewSummary');
  if (reviewList) reviewList.innerHTML = renderSummaryList(reviewCycleCounts) || '<span style="color: var(--muted); font-size: 11px;">No data available</span>';

  const ownerList = $('policyOwnerSummary');
  if (ownerList) ownerList.innerHTML = renderSummaryList(ownerCounts) || '<span style="color: var(--muted); font-size: 11px;">No data available</span>';
}

function updatePolicyFilters(rows) {
  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
  const statuses = [...new Set(rows.map(r => r.approvalStatus).filter(Boolean))].sort();
  const owners = [...new Set(rows.map(r => r.owner).filter(Boolean))].sort();

  const updateSelect = (id, options) => {
    const select = $(id);
    if (!select) return;
    const value = select.value;
    select.innerHTML = '<option value="all">All ' + (id.includes('Category') ? 'categories' : id.includes('Status') ? 'statuses' : 'owners') + '</option>' +
      options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');
    select.value = value;
  };

  updateSelect('policyRegisterCategoryFilter', categories);
  updateSelect('policyRegisterStatusFilter', statuses);
  updateSelect('policyRegisterOwnerFilter', owners);
}

async function loadPolicyRegisterRows() {
  const response = await fetch('/api/policy-register', { cache: 'no-store' });
  if (!response.ok) throw new Error('Policy register data unavailable');
  policyRegisterRows = await response.json();
  renderPolicyRegisterRows();
  if (csfRows.length) renderCsfTable();
  if (privacyRows.length) renderPrivacy();
  renderUploadedFiles();
}

function policyRegisterFormPayload() {
  return {
    title: $('policyRegisterTitle').value.trim(),
    category: $('policyRegisterCategory').value.trim(),
    owner: $('policyRegisterOwner').value.trim(),
    reviewCycle: $('policyRegisterReviewCycle').value.trim(),
    approvalStatus: $('policyRegisterApprovalStatus').value.trim(),
    lastReview: $('policyRegisterLastReview').value || null,
    notes: $('policyRegisterNotes').value.trim(),
  };
}

async function savePolicyRegisterItems(policyId, items) {
  const currentItems = (policyRegisterRows.find(row => String(row.id) === String(policyId))?.items || []);
  const submittedItems = items.filter(item => item.subtitle || item.content);
  const submittedIds = new Set(submittedItems.filter(item => item.id).map(item => String(item.id)));

  await Promise.all(currentItems
    .filter(item => !submittedIds.has(String(item.id)))
    .map(item => fetch(`/api/policy-register/${encodeURIComponent(policyId)}/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' })));

  for (const [index, item] of submittedItems.entries()) {
    const body = JSON.stringify({ subtitle: item.subtitle, content: item.content, sortOrder: index });
    const response = item.id
      ? await fetch(`/api/policy-register/${encodeURIComponent(policyId)}/items/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      : await fetch(`/api/policy-register/${encodeURIComponent(policyId)}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!response.ok) throw new Error('Policy detail save failed');
  }
}

async function savePolicyRegister(event) {
  event.preventDefault();
  const id = $('policyRegisterId').value;
  const formData = new FormData();
  const payload = policyRegisterFormPayload();
  const items = getPolicyRegisterItems();
  
  savePolicyDropdownOption('categories', payload.category);
  savePolicyDropdownOption('owners', payload.owner);
  savePolicyDropdownOption('reviewCycles', payload.reviewCycle);
  savePolicyDropdownOption('approvalStatuses', payload.approvalStatus);
  
  formData.append('data', JSON.stringify(payload));

  const file = $('policyRegisterFile').files?.[0];
  if (file) formData.append('file', file);

  $('policyRegisterStatus').textContent = 'Saving...';
  const response = await fetch(id ? `/api/policy-register/${encodeURIComponent(id)}` : '/api/policy-register', {
    method: id ? 'PUT' : 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    $('policyRegisterStatus').textContent = error.error || 'Save failed';
    return;
  }

  const savedRow = await response.json().catch(() => null);
  if (savedRow?.id) {
    await savePolicyRegisterItems(savedRow.id, items);
  }
  if (savedRow && savedRow.id) {
    const currentIndex = policyRegisterRows.findIndex(row => String(row.id) === String(savedRow.id));
    if (currentIndex >= 0) policyRegisterRows[currentIndex] = savedRow; else policyRegisterRows.unshift(savedRow);
  }
  await loadPolicyRegisterRows();
  $('policyRegisterStatus').textContent = id ? 'Policy updated' : 'Policy saved';
  setTimeout(() => { $('policyRegisterModal')?.close(); resetPolicyRegisterForm(); }, 800);
}

async function deletePolicyRegister(id) {
  if (!id || !confirm('Delete this policy record?')) return;
  const response = await fetch(`/api/policy-register/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    $('policyRegisterStatus').textContent = 'Delete failed';
    return;
  }
  policyRegisterRows = policyRegisterRows.filter(row => String(row.id) !== String(id));
  renderPolicyRegisterRows();
  resetPolicyRegisterForm();
  $('policyRegisterStatus').textContent = 'Policy deleted';
}

function showPolicyRegisterView() { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('policyRegisterView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'policy-register')); saveUiState('policy-register'); loadPolicyDropdownOptions(); loadPolicyRegisterRows().catch(() => { $('policyRegisterStatus').textContent = 'Database unavailable'; }); }

document.querySelectorAll('[data-policy-tab]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tab = e.currentTarget.dataset.policyTab;
    if (tab === 'reminder' && currentUserRole !== 'admin') return;
    document.querySelectorAll('[data-policy-tab]').forEach(b => b.classList.toggle('button-accent', b === e.target));
    document.querySelectorAll('[data-policy-tab]').forEach(b => b.classList.toggle('button-quiet', b !== e.target));
    $('policyRegisterPanel').hidden = tab !== 'register';
    $('policyReviewCalendarPanel').hidden = tab !== 'calendar';
    $('policySmtpPanel').hidden = tab !== 'reminder';
    if (tab !== 'reminder') $('policySmtpPassword').value = '';
    if (tab === 'calendar') renderPolicyReviewCalendar();
  });
});

$('policyRegisterSearch')?.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const rows = $('policyRegisterBody');
  if (!rows) return;
  const trs = rows.querySelectorAll('tr');
  trs.forEach(tr => {
    const text = tr.textContent.toLowerCase();
    tr.style.display = text.includes(query) ? '' : 'none';
  });
});

$('policyRegisterCategoryFilter')?.addEventListener('change', filterPolicyRegisterTable);
$('policyRegisterStatusFilter')?.addEventListener('change', filterPolicyRegisterTable);
$('policyRegisterOwnerFilter')?.addEventListener('change', filterPolicyRegisterTable);

$('policyRegisterClearFilters')?.addEventListener('click', () => {
  $('policyRegisterSearch').value = '';
  $('policyRegisterCategoryFilter').value = 'all';
  $('policyRegisterStatusFilter').value = 'all';
  $('policyRegisterOwnerFilter').value = 'all';
  filterPolicyRegisterTable();
});

$('policyReviewCalendarMonthFilter')?.addEventListener('change', () => {
  renderPolicyReviewCalendar();
});

$('policyReviewCalendarPrevious')?.addEventListener('click', () => {
  policyReviewCalendarDate = new Date(Date.UTC(policyReviewCalendarDate.getUTCFullYear(), policyReviewCalendarDate.getUTCMonth() - 1, 1));
  $('policyReviewCalendarMonthFilter').value = 'all';
  renderPolicyReviewCalendar();
});

$('policyReviewCalendarNext')?.addEventListener('click', () => {
  policyReviewCalendarDate = new Date(Date.UTC(policyReviewCalendarDate.getUTCFullYear(), policyReviewCalendarDate.getUTCMonth() + 1, 1));
  $('policyReviewCalendarMonthFilter').value = 'all';
  renderPolicyReviewCalendar();
});

$('policyReviewCalendarToday')?.addEventListener('click', () => {
  policyReviewCalendarDate = new Date();
  $('policyReviewCalendarMonthFilter').value = 'all';
  renderPolicyReviewCalendar();
});

$('policyRegisterExportButton')?.addEventListener('click', () => {
  const data = JSON.stringify(policyRegisterRows, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `policy-register-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function filterPolicyRegisterTable() {
  const categoryFilter = $('policyRegisterCategoryFilter')?.value || 'all';
  const statusFilter = $('policyRegisterStatusFilter')?.value || 'all';
  const ownerFilter = $('policyRegisterOwnerFilter')?.value || 'all';
  const searchQuery = ($('policyRegisterSearch')?.value || '').toLowerCase();

  const rows = $('policyRegisterBody');
  if (!rows) return;
  
  rows.querySelectorAll('tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 8) return;
    
    const title = cells[0].textContent.toLowerCase();
    const category = cells[1].textContent;
    const owner = cells[2].textContent;
    const status = cells[4].textContent;
    
    const matchesSearch = !searchQuery || title.includes(searchQuery);
    const matchesCategory = categoryFilter === 'all' || category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    const matchesOwner = ownerFilter === 'all' || owner === ownerFilter;
    
    tr.style.display = (matchesSearch && matchesCategory && matchesStatus && matchesOwner) ? '' : 'none';
  });
}

function showPolicyRegisterView() { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('policyRegisterView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'policy-register')); saveUiState('policy-register'); loadPolicyDropdownOptions(); loadPolicyRegisterRows().catch(() => { $('policyRegisterStatus').textContent = 'Database unavailable'; }); }
