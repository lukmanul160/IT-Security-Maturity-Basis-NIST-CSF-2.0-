window.addEventListener('pageshow', () => { fetch('/api/auth/me', { cache: 'no-store' }).then(response => { if (!response.ok) window.location.replace('/login'); }).catch(() => window.location.replace('/login')); });
const functions = [
  { id: 'GV', name: 'Govern', description: 'Establish and monitor cybersecurity strategy.', controls: ['Organizational Context', 'Risk Management Strategy', 'Roles, Responsibilities & Authorities', 'Policy'] },
  { id: 'ID', name: 'Identify', description: 'Understand assets, risks and opportunities.', controls: ['Asset Management', 'Risk Assessment', 'Improvement', 'Supply Chain Risk Management'] },
  { id: 'PR', name: 'Protect', description: 'Use safeguards to manage risk.', controls: ['Identity Management, Authentication & Access Control', 'Awareness & Training', 'Data Security', 'Platform Security'] },
  { id: 'DE', name: 'Detect', description: 'Find and analyze possible attacks.', controls: ['Continuous Monitoring', 'Adverse Event Analysis', 'Detection Processes', 'Event Reporting'] },
  { id: 'RS', name: 'Respond', description: 'Take action regarding detected incidents.', controls: ['Incident Management', 'Incident Analysis', 'Incident Response Reporting', 'Incident Mitigation'] },
  { id: 'RC', name: 'Recover', description: 'Restore capabilities and services.', controls: ['Incident Recovery Plan Execution', 'Incident Recovery Communication', 'Recovery Improvements', 'Post-Incident Review'] }
];
const maturityLabels = ['', 'Initial', 'Repeatable', 'Defined', 'Managed', 'Optimized'];
const categoryOrder = ['Organizational Context (GV.OC)', 'Risk Management Strategy (GV.RM)', 'Roles, Responsibilities, and Authorities (GV.RR)', 'Policy (GV.PO)', 'Oversight (GV.OV)', 'Cybersecurity Supply Chain Risk Management (GV.SC)', 'Asset Management (ID.AM)', 'Risk Assessment (ID.RA)', 'Improvement (ID.IM)', 'Identity Management, Authentication, and Access Control (PR.AA)', 'Awareness and Training (PR.AT)', 'Data Security (PR.DS)', 'Platform Security (PR.PS)', 'Technology Infrastructure Resilience (PR.IR)', 'Continuous Monitoring (DE.CM)', 'Adverse Event Analysis (DE.AE)', 'Incident Management (RS.MA)', 'Incident Analysis (RS.AN)', 'Incident Response Reporting and Communication (RS.CO)', 'Incident Mitigation (RS.MI)', 'Incident Recovery Plan Execution (RC.RP)', 'Incident Recovery Communication (RC.CO)'];
const defaultState = { scores: {}, policyScores: {}, practiceScores: {}, notes: {}, attachments: {}, targetScores: {} };
const normalizeState = source => { const parsed = source && typeof source === 'object' ? source : {}; const scores = parsed.scores || {}; const legacyTarget = Number(parsed.targetScore); const targetScores = Object.fromEntries(Object.entries(parsed.targetScores || {}).map(([key, value]) => [key, Number.isFinite(Number(value)) ? Math.min(5, Math.max(1, Number(value))) : 3])); return { scores, policyScores: parsed.policyScores || scores, practiceScores: parsed.practiceScores || scores, notes: parsed.notes || {}, attachments: Object.fromEntries(Object.entries(parsed.attachments || {}).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])), targetScores: Number.isFinite(legacyTarget) && !Object.keys(targetScores).length ? { _default: Math.min(5, Math.max(1, legacyTarget)) } : targetScores }; };
const loadState = () => {
  return { ...defaultState };
};
let state = loadState();
let currentUserRole = 'user';
let currentUserPermissions = [];
const permissionFallback = { permissions: [['framework', 'Choose framework'], ['csf', 'CSF 2.0'], ['privacy', 'Privacy Framework'], ['iso27001', 'ISO 27001:2022'], ['iso27001-soa', 'SOA (Statement of Applicability)'], ['assessment', 'CSF assessment'], ['privacy-assessment', 'Privacy assessment'], ['risk-acceptance', 'Risk Acceptance'], ['audit-finding-tracker', 'Audit Finding Tracker'], ['risk-management', 'Risk Management'], ['policy-register', 'Policy Register'], ['personnel-certification', 'Personnel Certification'], ['tprm', 'Third-Party Risk Management'], ['tprm-tiering', 'Vendor Tiering Matrix'], ['tprm-questionnaire', 'Due Diligence Questionnaire'], ['questionnaire-templates', 'Questionnaire Templates'], ['tprm-register', 'TPRM Risk Register'], ['files', 'Uploaded files'], ['account', 'Account Management']], assignments: [] };
const policyRegisterActions = { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor'], update: ['admin', 'approver', 'editor'], delete: ['admin', 'approver'] };
const canManagePolicyRegister = action => currentUserRole === 'admin' || policyRegisterActions[action]?.includes(currentUserRole);
let accountUsers = [];
const uiStorageKey = 'nist-maturity-ui';
const sidebarStorageKey = 'nist-sidebar-collapsed';
const loadUiState = () => { try { return JSON.parse(localStorage.getItem(uiStorageKey) || '{"view":"framework","function":"GV"}'); } catch (error) { return { view: 'framework', function: 'GV' }; } };
const uiState = loadUiState();
let activeFunction = uiState.function || 'GV';
let csfRows = window.csfRows || [];
let privacyRows = [];
let privacyState = { scores: {}, policyScores: {}, practiceScores: {}, notes: {}, attachments: {}, targetScores: {} };
let riskAcceptanceForms = [];
let riskManagementRows = [];
let riskIndicators = [];
let riskDropdowns = [];
let personnelCertifications = [];
let organizationPersonnel = [];
let certificationRoadmapCatalog = [];
let policyReviewCalendarDate = new Date();
let certificationReferenceLoaded = false;
let riskRegisterSort = { field: 'riskRating', direction: 'desc' };
let riskRegisterPage = 1;
let privacyDataReady = Promise.resolve();
let csfAssessmentPage = 1;
let csfCorePage = 1;
let csfSort = 'id';
let privacyAssessmentPage = 1;
let privacySort = 'id';
let riskAcceptancePage = 1;
let uploadedFilesPage = 1;
let uploadedFileRecordMap = new Map();
let csfManagePage = 1;
let privacyManagePage = 1;
let accountUsersPage = 1;
let auditPage = 1;
const auditPageSize = 25;
let uploadDirectoryHandle = null;
const uploadFolderStorageKey = 'nist-upload-folder-name';
const attachmentHandles = new Map();
const uploadStatuses = new Map();
const uploadHandleDbName = 'nist-maturity-upload-handles';
const uploadHandleStoreName = 'folders';
function openUploadHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(uploadHandleDbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(uploadHandleStoreName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveUploadDirectoryHandle(handle) {
  const database = await openUploadHandleDb();
  await new Promise((resolve, reject) => { const request = database.transaction(uploadHandleStoreName, 'readwrite').objectStore(uploadHandleStoreName).put(handle, 'selected'); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  database.close();
}
async function removeSavedUploadDirectoryHandle() {
  if (!('indexedDB' in window)) return;
  const database = await openUploadHandleDb();
  await new Promise((resolve, reject) => { const request = database.transaction(uploadHandleStoreName, 'readwrite').objectStore(uploadHandleStoreName).delete('selected'); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  database.close();
}
async function getSavedUploadDirectoryHandle() {
  if (!('indexedDB' in window)) return null;
  const database = await openUploadHandleDb();
  const handle = await new Promise((resolve, reject) => { const request = database.transaction(uploadHandleStoreName).objectStore(uploadHandleStoreName).get('selected'); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
  database.close(); return handle;
}
async function restoreUploadDirectoryHandle(requestPermission = false) {
  try {
    const handle = await getSavedUploadDirectoryHandle(); if (!handle) return false;
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && (!requestPermission || await handle.requestPermission({ mode: 'readwrite' }) !== 'granted')) return false;
    uploadDirectoryHandle = handle; syncUploadFolderStatus(`Folder: ${handle.name}`); return true;
  } catch (error) { return false; }
}
const saveUiState = (view, functionId = activeFunction) => localStorage.setItem(uiStorageKey, JSON.stringify({ view, function: functionId }));
if (csfRows.length) {
  const legacyScores = Object.entries(state.scores).filter(([id]) => /^[A-Z]{2}-\d+$/.test(id));
  legacyScores.forEach(([id, score]) => {
    const fn = id.slice(0, 2); const index = Number(id.split('-')[1]) - 1; const replacement = csfRows.filter(row => row.id.startsWith(fn + '-'))[index];
    if (replacement && state.practiceScores[replacement.id] === undefined) state.practiceScores[replacement.id] = score;
    if (replacement && state.policyScores[replacement.id] === undefined) state.policyScores[replacement.id] = score;
    delete state.scores[id];
  });
}

const $ = (id) => document.getElementById(id);
function applyUserAccess() {
  document.querySelector('[data-account-tab="smtp"]').hidden = currentUserRole !== 'admin';
  $('fileStorageSettings').hidden = currentUserRole !== 'admin';
  $('policySmtpOpen').hidden = currentUserRole !== 'admin';
  if (currentUserPermissions.includes('csf')) currentUserPermissions = [...new Set([...currentUserPermissions, 'iso27001', 'iso27001-soa'])];
  $('roadmapCatalogNewButton').hidden = currentUserRole !== 'admin';
  $('policyRegisterNewButton').hidden = !canManagePolicyRegister('create');
  document.querySelectorAll('.dropdown-edit-btn').forEach(button => { button.hidden = !canManagePolicyRegister('update'); });
  renderUploadedFiles();
  if (currentUserRole === 'admin') return;
  document.body.classList.add('user-mode');
  document.querySelectorAll('#privacyManageView, #csfManageView, [data-view="privacy-manage"], [data-view="csf-manage"], #csfManageNewButton, #privacyManageNewButton, #addCsfButton, #addPrivacyButton, #csfControlModal, #privacyControlModal, #csfTopResetButton, #csfResetButton, #privacyResetButton, #iso27001ResetButton, #riskManagementNewButton, #riskRegisterResetButton, #riskRegisterSubmit, #riskRegisterCancel, #riskIndicatorNewButton, #riskRegisterImportInput, #csfAssessmentButton, #privacyAssessmentButton, [data-open-csf-modal], [data-open-privacy-modal], #csfView .excel-table th:last-child, #csfView .excel-table td:last-child, #privacyView .excel-table th:last-child, #privacyView .excel-table td:last-child').forEach(element => { element.hidden = true; element.disabled = true; });
  if (['privacy-manage', 'files', 'csf-manage'].includes(uiState.view)) document.querySelector('[data-view="framework"]').click();
    const pageMap = { 'audit-finding-tracker': ['audit-finding-tracker', 'auditFindingView'], framework: ['framework', 'frameworkView'], csf: ['csf', 'csfView'], privacy: ['privacy', 'privacyView'], iso27001: ['iso27001', 'iso27001View'], 'iso27001-soa': ['iso27001-soa', 'iso27001View'], assessment: ['assessment', 'assessmentView'], 'privacy-assessment': ['privacy-assessment', 'privacyAssessmentView'], 'risk-acceptance': ['risk-acceptance', 'riskAcceptanceView'], 'risk-management': ['risk-management', 'riskManagementView'], 'policy-register': ['policy-register', 'policyRegisterView'], 'personnel-certification': ['personnel-certification', 'personnelCertificationView'], tprm: ['tprm', 'tprmView'], 'tprm-tiering': ['tprm-tiering', 'tprmTieringView'], 'tprm-questionnaire': ['tprm-questionnaire', 'tprmQuestionnaireView'], 'questionnaire-templates': ['questionnaire-templates', 'questionnaireTemplateView'], 'tprm-register': ['tprm-register', 'tprmRegisterView'], files: ['files', 'filesView'], backups: ['backups', 'backupsView'], account: ['account', 'accountView'] };
    if (currentUserRole === 'viewer') {
      document.querySelectorAll('#accountUserForm, #accountUserCancel, #accountUserRole, #accountUsersBody button, #permissionManagementPanel, #permissionSaveButton').forEach(element => { if (element) { element.hidden = true; element.disabled = true; } });
    }
    Object.entries(pageMap).forEach(([view, [permission, sectionId]]) => { const nav = document.querySelector(`[data-view="${view}"]`); const section = $(sectionId); if (!currentUserPermissions.includes(permission)) { if (nav) { nav.hidden = true; nav.disabled = true; } if (section) section.hidden = true; } });
    if (!currentUserPermissions.includes(uiState.view)) uiState.view = currentUserPermissions.find(permission => pageMap[permission]) || 'account';
}
fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(user => { if (!user) return; currentUserRole = user.role; currentUserPermissions = user.permissions?.length ? user.permissions : (user.role === 'admin' ? permissionFallback.permissions.map(([key]) => key) : user.role === 'approver' ? ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files'] : user.role === 'viewer' ? ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'tprm-register'] : ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'account']); $('currentUser').textContent = user.fullName ? `${user.username} (${user.fullName})` : user.username; applyUserAccess(); privacyDataReady = loadPrivacyData(); privacyDataReady.catch(() => { $('saveState').textContent = 'Privacy Framework unavailable'; }); });
const syncUploadFolderStatus = text => document.querySelectorAll('#uploadFolderState, #assessmentUploadFolderState').forEach(element => { element.textContent = text; });
const allControls = () => csfRows.length ? csfRows.map(row => ({ ...row, id: row.id, code: row.id, name: row.subcategory.split(':').slice(1).join(':').trim(), fn: functions.find(fn => row.id.startsWith(fn.id + '-')) || functions[0] })) : functions.flatMap(fn => fn.controls.map((name, index) => ({ id: `${fn.id}-${index + 1}`, code: `${fn.id}.${index + 1}`, name, fn })));
const controlsFor = fn => allControls().filter(item => item.fn.id === fn.id);
const privacyScoreFor = (item, kind) => (kind === 'policy' ? privacyState.policyScores[item.id] : privacyState.practiceScores[item.id]) ?? null;
const privacyTargetScoreFor = category => { const value = privacyState.targetScores?.[category] ?? privacyState.targetScores?._default ?? 3; return Number.isFinite(Number(value)) ? Math.min(5, Math.max(1, Number(value))) : 3; };
const privacyTargetScoreAverage = categories => { const values = categories.map(privacyTargetScoreFor); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 3; };
const csfTargetScoreFor = category => { const value = state.targetScores?.[category] ?? state.targetScores?._default ?? 3; return Number.isFinite(Number(value)) ? Math.min(4, Math.max(0, Number(value))) : 3; };
async function persistCategoryTarget(framework, category, targetScore) { const response = await fetch(`/api/frameworks/${framework}/targets/${encodeURIComponent(category)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetScore }) }); if (!response.ok) throw new Error('Target score save failed'); }
const privacyFunctions = () => [...new Map(privacyRows.map(item => [item.function.split(' (', 1)[0], { id: item.function.match(/\(([A-Z]+-P)\)/)?.[1] || item.function.split(' (', 1)[0], name: item.function.split(' (', 1)[0], description: item.function.split(': ').slice(1).join(': ') }])).values()];
const privacyScoreButtons = (item, kind) => `<div class="score-buttons" aria-label="${kind} maturity score">${[1, 2, 3, 4, 5].map(score => `<button type="button" class="score-button ${privacyScoreFor(item, kind) === score ? 'selected' : ''}" data-privacy-score="${score}" data-score-type="${kind}" data-privacy-control="${item.id}">${score}</button>`).join('')}</div>`;
const renderAssessmentPagination = (id, page, total) => { const pageCount = Math.max(1, Math.ceil(total / 20)); const current = Math.min(Math.max(1, page), pageCount); const element = $(id); if (!element) return current; element.innerHTML = pageCount > 1 ? `<button type="button" data-assessment-page="${id}" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Previous</button><span>Page ${current} of ${pageCount} · ${total} controls</span><button type="button" data-assessment-page="${id}" data-page="${current + 1}" ${current === pageCount ? 'disabled' : ''}>Next</button>` : ''; return current; };
const renderListPagination = (id, page, total, label) => { const pageCount = Math.max(1, Math.ceil(total / 20)); const current = Math.min(Math.max(1, page), pageCount); const element = $(id); if (!element) return current; element.innerHTML = pageCount > 1 ? `<button type="button" data-list-page="${id}" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Previous</button><span>Page ${current} of ${pageCount} · ${total} ${label}</span><button type="button" data-list-page="${id}" data-page="${current + 1}" ${current === pageCount ? 'disabled' : ''}>Next</button>` : ''; return id === 'tprmRiskPickerPagination' ? element.innerHTML : current; };
const attachmentStateFor = key => key.startsWith('privacy-') ? privacyState : state;
const normalizeFileSearch = query => String(query || '').trim().toLowerCase();
const policyRegisterFiles = () => policyRegisterRows.flatMap((row, index) => row.attachmentName && row.attachmentPath ? [{ name: row.attachmentName, path: String(row.attachmentPath).startsWith('upload/') ? row.attachmentPath : `upload/${row.attachmentPath}`, type: row.attachmentType || '', updatedAt: row.updatedAt, sourceKey: 'policy-register', sourceIndex: index, policyId: row.id }] : []);
const privacyFilePicker = (key, query = '', page = 1) => { const normalizedQuery = normalizeFileSearch(query); const files = [...new Map([...Object.entries(privacyState.attachments || {}).flatMap(([sourceKey, attachments]) => (attachments || []).map((file, index) => ({ ...file, sourceKey, index }))), ...policyRegisterFiles().map(file => ({ ...file, sourceKey: file.sourceKey, index: file.sourceIndex }))].filter(file => `${file.name} ${file.path}`.toLowerCase().includes(normalizedQuery)).map(file => [file.path, file])).values()]; const pageCount = Math.max(1, Math.ceil(files.length / 20)); const current = Math.min(Math.max(1, page), pageCount); const visible = files.slice((current - 1) * 20, current * 20); return `<div class="existing-file-picker-label">Select uploaded evidence (${files.length})</div><input type="search" placeholder="Search uploaded evidence..." aria-label="Search uploaded evidence" data-privacy-existing-search="${key}" value="${escapeHtml(query)}" autocomplete="off"><div class="existing-file-options">${visible.map(file => `<button type="button" class="existing-file-option" data-use-privacy-existing="${key}" data-source-key="${file.sourceKey}" data-source-index="${file.index}"><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.path)}</small></button>`).join('') || '<small class="existing-file-empty">No uploaded evidence available.</small>'}</div><div class="existing-file-pagination"><button type="button" data-privacy-existing-page="${key}" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Previous</button><span>Page ${current} of ${pageCount}</span><button type="button" data-privacy-existing-page="${key}" data-page="${current + 1}" ${current === pageCount ? 'disabled' : ''}>Next</button></div>`; };
const privacyAttachmentControl = (item, kind) => { const key = `privacy-${kind}-${item.id}`; const attachments = privacyState.attachments[key] || []; const status = uploadStatuses.get(key) || { percent: 0, message: 'Ready', status: '' }; return `<div class="attachment-control privacy-attachment-control"><div class="score-label">Maturity score${privacyScoreButtons(item, kind)}</div><div class="attachment-buttons"><label class="attachment-button">Add file<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple data-attachment="${key}" data-function="${escapeHtml(item.function.split(' (', 1)[0])}" data-kind="${kind}" data-scope="privacy"></label><button class="attachment-button" type="button" data-toggle-privacy-existing="${key}">Select uploaded evidence</button></div><div class="existing-file-picker" data-privacy-existing-picker="${key}">${privacyFilePicker(key)}</div><div class="upload-progress ${status.status}" data-progress-key="${key}"><span class="upload-progress-track"><i style="width:${status.percent}%"></i></span><small>${escapeHtml(status.message)}</small></div><div class="attachment-list">${attachments.map((attachment, index) => `<div class="attachment-item"><span class="attachment-name" title="${escapeHtml(attachment.path)}">${escapeHtml(attachment.name)}</span><div class="attachment-actions"><button class="attachment-action-button" type="button" data-open-attachment="${key}" data-attachment-index="${index}">Open</button><button class="attachment-action-button" type="button" data-download-attachment="${key}" data-attachment-index="${index}">Download</button><label class="attachment-action-button attachment-action">Replace<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" data-replace-attachment="${key}" data-attachment-index="${index}" data-function="${escapeHtml(item.function.split(' (', 1)[0])}" data-kind="${kind}" data-scope="privacy"></label><button class="attachment-action-button danger" type="button" data-delete-attachment="${key}" data-attachment-index="${index}">Delete</button></div></div>`).join('')}</div></div>`; };
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
function existingFilePicker(key, query = '', page = 1) { const normalizedQuery = normalizeFileSearch(query); const files = [...new Map(attachmentRecords().filter(file => `${file.name} ${file.path} ${file.item.fn.name} ${file.item.category} ${file.item.subcategory}`.toLowerCase().includes(normalizedQuery)).map(file => [file.path, file])).values()]; const pageSize = 20; const pageCount = Math.max(1, Math.ceil(files.length / pageSize)); const currentPage = Math.min(Math.max(1, page), pageCount); const visibleFiles = files.slice((currentPage - 1) * pageSize, currentPage * pageSize); return `<div class="existing-file-picker-label">Select uploaded evidence (${files.length})</div><input type="search" placeholder="Search uploaded evidence..." aria-label="Search uploaded evidence" data-existing-search="${key}" value="${escapeHtml(query)}" autocomplete="off"><div class="existing-file-options">${visibleFiles.map(file => `<button type="button" class="existing-file-option" data-use-existing="${key}" data-source-key="${file.key}" data-source-index="${file.index}"><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.path)}</small></button>`).join('') || '<small class="existing-file-empty">No uploaded evidence available.</small>'}</div><div class="existing-file-pagination"><button type="button" data-existing-page="${key}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${pageCount}</span><button type="button" data-existing-page="${key}" data-page="${currentPage + 1}" ${currentPage === pageCount ? 'disabled' : ''}>Next</button></div>`; }
function renderExistingPicker(key, query, page) { const picker = document.querySelector(`[data-existing-picker="${key}"]`); if (picker) picker.innerHTML = existingFilePicker(key, query, page); }
const scoreControl = (item, kind) => { const current = kind === 'policy' ? policyScoreFor(item.id) : scoreFor(item.id); return `<div class="score-buttons" aria-label="${kind} maturity score">${[1, 2, 3, 4, 5].map(score => `<button type="button" class="score-button ${current === score ? 'selected' : ''}" data-assessment-score="${score}" data-score-type="${kind}" data-control="${item.id}">${score}</button>`).join('')}</div>`; };
function renderScoreControls() { document.querySelectorAll('[data-attachment]').forEach(input => { const group = input.closest('.attachment-control'); if (!group || group.querySelector('[data-assessment-score]')) return; const kind = input.dataset.kind; const item = allControls().find(control => control.id === input.dataset.attachment.slice(kind.length + 1)); if (!item) return; const label = document.createElement('div'); label.className = 'score-label'; label.innerHTML = `Maturity score${scoreControl(item, kind)}`; group.prepend(label); }); }
const attachmentControl = (item, kind) => { const key = `${kind}-${item.id}`; const attachments = state.attachments[key] || []; const status = uploadStatuses.get(key) || { percent: 0, message: 'Ready', status: '' }; return `<div class="attachment-control"><div class="attachment-buttons"><label class="attachment-button">Add file<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple data-attachment="${key}" data-function="${item.fn.name}" data-kind="${kind}"></label><button class="attachment-button" type="button" data-toggle-existing="${key}">Select uploaded evidence</button></div><div class="existing-file-picker" data-existing-picker="${key}">${existingFilePicker(key)}</div><div class="upload-progress ${status.status}" data-progress-key="${key}"><span class="upload-progress-track"><i style="width:${status.percent}%"></i></span><small>${escapeHtml(status.message)}</small></div><div class="attachment-list">${attachments.map((attachment, index) => `<div class="attachment-item"><span class="attachment-name" title="${escapeHtml(attachment.path)}">${escapeHtml(attachment.name)}</span><div class="attachment-actions"><button class="attachment-action-button" type="button" data-open-attachment="${key}" data-attachment-index="${index}">Open</button><button class="attachment-action-button" type="button" data-download-attachment="${key}" data-attachment-index="${index}">Download</button><label class="attachment-action-button attachment-action">Replace<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" data-replace-attachment="${key}" data-attachment-index="${index}" data-function="${item.fn.name}" data-kind="${kind}"></label><button class="attachment-action-button danger" type="button" data-delete-attachment="${key}" data-attachment-index="${index}">Delete</button></div></div>`).join('')}</div></div>`; };
const scoreFor = id => state.practiceScores[id] ?? state.scores[id] ?? null;
const policyScoreFor = id => state.policyScores[id] ?? scoreFor(id);
const categoryLabel = value => value.split(':', 1)[0].trim();
const categorySummary = () => { const groups = new Map(); allControls().forEach(item => { const key = `${item.fn.id}|${item.category}`; if (!groups.has(key)) groups.set(key, { fn: item.fn, category: categoryLabel(item.category || 'CSF Core'), controls: [] }); groups.get(key).controls.push(item); }); return [...groups.values()].sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)).map(group => { const policy = group.controls.map(item => policyScoreFor(item.id)).filter(value => value !== null); const practice = group.controls.map(item => scoreFor(item.id)).filter(value => value !== null); return { ...group, count: group.controls.length, policy: policy.length ? policy.reduce((a, b) => a + b, 0) / policy.length : null, practice: practice.length ? practice.reduce((a, b) => a + b, 0) / practice.length : null }; }); };
const save = () => { $('saveState').textContent = 'Saving...'; fetch('/api/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).then(() => { $('saveState').textContent = 'Saved just now'; clearTimeout(save.statusTimer); save.statusTimer = setTimeout(() => $('saveState').textContent = 'Autosaved', 1400); }).catch(() => { $('saveState').textContent = 'Database unavailable'; }); };
const stats = () => { const controls = allControls(); const scored = controls.filter(c => scoreFor(c.id) !== null); const summaries = categorySummary(); const scoredCategories = summaries.filter(summary => summary.practice !== null); const average = scoredCategories.length ? scoredCategories.reduce((sum, summary) => sum + summary.practice, 0) / scoredCategories.length : 0; return { controls, scored, average, completion: Math.round(scored.length / controls.length * 100), gaps: controls.filter(c => scoreFor(c.id) === null || scoreFor(c.id) < csfTargetScoreFor(c.category)).length }; };
async function loadDefaultFile() {
  try {
    const response = await fetch('/api/assessment', { cache: 'no-store' });
    if (!response.ok) return false;
    const imported = await response.json();
    if (!imported || typeof imported !== 'object') return false;
    state = normalizeState(imported);
    return true;
  } catch (error) {
    return false;
  }
}

