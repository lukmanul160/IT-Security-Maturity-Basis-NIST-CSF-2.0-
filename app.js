const functions = [
  { id: 'GV', name: 'Govern', description: 'Establish and monitor cybersecurity strategy.', controls: ['Organizational Context', 'Risk Management Strategy', 'Roles, Responsibilities & Authorities', 'Policy'] },
  { id: 'ID', name: 'Identify', description: 'Understand assets, risks and opportunities.', controls: ['Asset Management', 'Risk Assessment', 'Improvement', 'Supply Chain Risk Management'] },
  { id: 'PR', name: 'Protect', description: 'Use safeguards to manage risk.', controls: ['Identity Management, Authentication & Access Control', 'Awareness & Training', 'Data Security', 'Platform Security'] },
  { id: 'DE', name: 'Detect', description: 'Find and analyze possible attacks.', controls: ['Continuous Monitoring', 'Adverse Event Analysis', 'Detection Processes', 'Event Reporting'] },
  { id: 'RS', name: 'Respond', description: 'Take action regarding detected incidents.', controls: ['Incident Management', 'Incident Analysis', 'Incident Response Reporting', 'Incident Mitigation'] },
  { id: 'RC', name: 'Recover', description: 'Restore capabilities and services.', controls: ['Incident Recovery Plan Execution', 'Incident Recovery Communication', 'Recovery Improvements', 'Post-Incident Review'] }
];
const maturityLabels = ['Incomplete', 'Initial', 'Developing', 'Defined', 'Adaptive'];
const categoryOrder = ['Organizational Context (GV.OC)', 'Risk Management Strategy (GV.RM)', 'Roles, Responsibilities, and Authorities (GV.RR)', 'Policy (GV.PO)', 'Oversight (GV.OV)', 'Cybersecurity Supply Chain Risk Management (GV.SC)', 'Asset Management (ID.AM)', 'Risk Assessment (ID.RA)', 'Improvement (ID.IM)', 'Identity Management, Authentication, and Access Control (PR.AA)', 'Awareness and Training (PR.AT)', 'Data Security (PR.DS)', 'Platform Security (PR.PS)', 'Technology Infrastructure Resilience (PR.IR)', 'Continuous Monitoring (DE.CM)', 'Adverse Event Analysis (DE.AE)', 'Incident Management (RS.MA)', 'Incident Analysis (RS.AN)', 'Incident Response Reporting and Communication (RS.CO)', 'Incident Mitigation (RS.MI)', 'Incident Recovery Plan Execution (RC.RP)', 'Incident Recovery Communication (RC.CO)'];
const defaultState = { scores: {}, policyScores: {}, practiceScores: {}, notes: {}, attachments: {} };
const normalizeState = source => { const parsed = source && typeof source === 'object' ? source : {}; const scores = parsed.scores || {}; return { scores, policyScores: parsed.policyScores || scores, practiceScores: parsed.practiceScores || scores, notes: parsed.notes || {}, attachments: Object.fromEntries(Object.entries(parsed.attachments || {}).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])) }; };
const storageKey = 'nist-maturity-assessment';
const loadState = () => {
  try {
    const stored = localStorage.getItem(storageKey);
    return normalizeState(stored ? JSON.parse(stored) : defaultState);
  } catch (error) {
    return { ...defaultState };
  }
};
let state = loadState();
const uiStorageKey = 'nist-maturity-ui';
const loadUiState = () => { try { return JSON.parse(localStorage.getItem(uiStorageKey) || '{"view":"overview","function":"GV"}'); } catch (error) { return { view: 'overview', function: 'GV' }; } };
const uiState = loadUiState();
let activeFunction = uiState.function || 'GV';
let csfRows = window.csfRows || [];
let uploadDirectoryHandle = null;
const uploadFolderStorageKey = 'nist-upload-folder-name';
const attachmentHandles = new Map();
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
const syncUploadFolderStatus = text => document.querySelectorAll('#uploadFolderState, #assessmentUploadFolderState').forEach(element => { element.textContent = text; });
const allControls = () => csfRows.length ? csfRows.map(row => ({ ...row, id: row.id, code: row.id, name: row.subcategory.split(':').slice(1).join(':').trim(), fn: functions.find(fn => row.id.startsWith(fn.id + '-')) || functions[0] })) : functions.flatMap(fn => fn.controls.map((name, index) => ({ id: `${fn.id}-${index + 1}`, code: `${fn.id}.${index + 1}`, name, fn })));
const controlsFor = fn => allControls().filter(item => item.fn.id === fn.id);
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
function existingFilePicker(key, query = '', page = 1) { const files = attachmentRecords().filter(file => `${file.name} ${file.path} ${file.item.fn.name} ${file.item.category} ${file.item.subcategory}`.toLowerCase().includes(query.toLowerCase())); const pageSize = 10; const pageCount = Math.max(1, Math.ceil(files.length / pageSize)); const currentPage = Math.min(Math.max(1, page), pageCount); const visibleFiles = files.slice((currentPage - 1) * pageSize, currentPage * pageSize); return `<div class="existing-file-picker-label">Select uploaded evidence</div><input type="search" placeholder="Search uploaded evidence..." data-existing-search="${key}" value="${escapeHtml(query)}" autocomplete="off"><div class="existing-file-options">${visibleFiles.map(file => `<button type="button" class="existing-file-option" data-use-existing="${key}" data-source-key="${file.key}" data-source-index="${file.index}"><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.path)}</small></button>`).join('') || '<small class="existing-file-empty">No uploaded evidence available.</small>'}</div><div class="existing-file-pagination"><button type="button" data-existing-page="${key}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${pageCount}</span><button type="button" data-existing-page="${key}" data-page="${currentPage + 1}" ${currentPage === pageCount ? 'disabled' : ''}>Next</button></div>`; }
function renderExistingPicker(key, query, page) { const picker = document.querySelector(`[data-existing-picker="${key}"]`); if (picker) picker.innerHTML = existingFilePicker(key, query, page); }
const attachmentControl = (item, kind) => { const key = `${kind}-${item.id}`; const attachments = state.attachments[key] || []; return `<div class="attachment-control"><div class="attachment-buttons"><label class="attachment-button">Add file<input type="file" accept="*/*" multiple data-attachment="${key}" data-function="${item.fn.name}" data-kind="${kind}"></label><button class="attachment-button" type="button" data-toggle-existing="${key}">Select uploaded evidence</button></div><div class="existing-file-picker" data-existing-picker="${key}">${existingFilePicker(key)}</div><div class="upload-progress" data-progress-key="${key}"><span class="upload-progress-track"><i></i></span><small>Ready</small></div><div class="attachment-list">${attachments.map((attachment, index) => `<div class="attachment-item"><span class="attachment-name" title="${escapeHtml(attachment.path)}">${escapeHtml(attachment.name)}</span><div class="attachment-actions"><button class="attachment-action-button" type="button" data-open-attachment="${key}" data-attachment-index="${index}">Open</button><button class="attachment-action-button" type="button" data-download-attachment="${key}" data-attachment-index="${index}">Download</button><label class="attachment-action-button attachment-action">Replace<input type="file" accept="*/*" data-replace-attachment="${key}" data-attachment-index="${index}" data-function="${item.fn.name}" data-kind="${kind}"></label><button class="attachment-action-button danger" type="button" data-delete-attachment="${key}" data-attachment-index="${index}">Delete</button></div></div>`).join('')}</div></div>`; };
const scoreFor = id => state.practiceScores[id] ?? state.scores[id] ?? null;
const policyScoreFor = id => state.policyScores[id] ?? scoreFor(id);
const categoryLabel = value => value.split(':', 1)[0].trim();
const categorySummary = () => { const groups = new Map(); allControls().forEach(item => { const key = `${item.fn.id}|${item.category}`; if (!groups.has(key)) groups.set(key, { fn: item.fn, category: categoryLabel(item.category || 'CSF Core'), controls: [] }); groups.get(key).controls.push(item); }); return [...groups.values()].sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)).map(group => { const policy = group.controls.map(item => policyScoreFor(item.id)).filter(value => value !== null); const practice = group.controls.map(item => scoreFor(item.id)).filter(value => value !== null); return { ...group, count: group.controls.length, policy: policy.length ? policy.reduce((a, b) => a + b, 0) / policy.length : null, practice: practice.length ? practice.reduce((a, b) => a + b, 0) / practice.length : null }; }); };
const save = () => { $('saveState').textContent = 'Saving...'; localStorage.setItem(storageKey, JSON.stringify(state)); $('saveState').textContent = 'Saved just now'; clearTimeout(save.statusTimer); save.statusTimer = setTimeout(() => $('saveState').textContent = 'Autosaved', 1400); };
const stats = () => { const controls = allControls(); const scored = controls.filter(c => scoreFor(c.id) !== null); const summaries = categorySummary(); const scoredCategories = summaries.filter(summary => summary.practice !== null); const average = scoredCategories.length ? scoredCategories.reduce((sum, summary) => sum + summary.practice, 0) / scoredCategories.length : 0; return { controls, scored, average, completion: Math.round(scored.length / controls.length * 100), gaps: controls.filter(c => scoreFor(c.id) === null || scoreFor(c.id) < 3).length }; };
async function loadDefaultFile() {
  if (localStorage.getItem(storageKey)) return false;
  try {
    const response = await fetch('nist-csf-2.0-assessment.json', { cache: 'no-store' });
    if (!response.ok) return false;
    const file = await response.json();
    const imported = file.assessment || file;
    if (!imported || typeof imported !== 'object') return false;
    state = normalizeState(imported);
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
}

function renderOverview() {
  const s = stats();
  $('overallScore').textContent = s.average.toFixed(1); $('overallLabel').textContent = s.scored.length ? maturityLabels[Math.round(s.average)] : 'Not assessed'; $('overallMeter').style.width = `${s.average / 4 * 100}%`;
  $('completionValue').textContent = `${s.completion}%`; $('completionDetail').textContent = `${s.scored.length} of ${s.controls.length} controls scored`; $('completionRing').style.transform = `rotate(${s.completion * 3.6}deg)`; $('gapValue').textContent = s.gaps;
  $('functionCards').innerHTML = functions.map(fn => { const controls = controlsFor(fn); const policy = controls.map(item => policyScoreFor(item.id)).filter(value => value !== null); const practice = controls.map(item => scoreFor(item.id)).filter(value => value !== null); const policyAverage = policy.length ? policy.reduce((a, b) => a + b, 0) / policy.length : null; const practiceAverage = practice.length ? practice.reduce((a, b) => a + b, 0) / practice.length : null; const displayAverage = practiceAverage ?? policyAverage ?? 0; return `<article class="function-card" data-function="${fn.id}"><div class="card-top"><div><p class="eyebrow">${fn.id} / ${controls.length} controls</p><h4>${fn.name}</h4><p>${fn.description}</p></div><span class="card-score">${displayAverage.toFixed(1)}</span></div><div class="coverage-scores"><div class="coverage-score"><small>Policy</small><strong>${policyAverage === null ? '-' : policyAverage.toFixed(1)}</strong></div><div class="coverage-score"><small>Practice</small><strong>${practiceAverage === null ? '-' : practiceAverage.toFixed(1)}</strong></div></div><div class="card-bar"><span style="width:${displayAverage / 4 * 100}%"></span></div></article>`; }).join('');
  document.querySelectorAll('.function-card').forEach(card => card.addEventListener('click', () => showAssessment(card.dataset.function)));
  const low = allControls().map(item => ({ name: item.name, fn: item.fn, score: scoreFor(item.id) })).sort((a, b) => (a.score ?? -1) - (b.score ?? -1)).slice(0, 3);
  $('recommendations').innerHTML = low.map(item => `<div class="recommendation"><b>${item.score === null ? '!' : item.score}</b><div><strong>${item.name}</strong><small>${item.fn.name} · ${item.score === null ? 'Needs assessment' : 'Below target maturity'}</small></div></div>`).join('');
  renderSummary();
}
function renderSummary() {
  const summaries = categorySummary(); const policyValues = summaries.filter(summary => summary.policy !== null); const practiceValues = summaries.filter(summary => summary.practice !== null); const averagePolicy = policyValues.length ? policyValues.reduce((sum, summary) => sum + summary.policy, 0) / policyValues.length : null; const averagePractice = practiceValues.length ? practiceValues.reduce((sum, summary) => sum + summary.practice, 0) / practiceValues.length : null;
  $('csfSummaryBody').innerHTML = `<tr class="summary-overall"><td colspan="2">Overall Average Score</td><td></td><td>3.0</td><td>${averagePolicy === null ? '-' : averagePolicy.toFixed(1)}</td><td>${averagePractice === null ? '-' : averagePractice.toFixed(1)}</td></tr>` + summaries.map(summary => `<tr><td>${summary.fn.id}</td><td>${escapeHtml(summary.category)}</td><td>${summary.count}</td><td>3.0</td><td>${summary.policy === null ? '-' : summary.policy.toFixed(1)}</td><td>${summary.practice === null ? '-' : summary.practice.toFixed(1)}</td></tr>`).join('');
  renderRadar();
}
function renderRadar() {
  const canvas = $('maturityRadar'); const context = canvas.getContext('2d'); const bounds = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; const width = Math.max(bounds.width, 320); const height = 430; canvas.width = width * ratio; canvas.height = height * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
  const summaries = categorySummary(); const average = values => { const scored = values.filter(value => value !== null); return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : 0; }; const labels = ['Overall Average Score', ...summaries.map(summary => summary.category)]; const series = { target: labels.map(() => 3), policy: [average(summaries.map(summary => summary.policy)), ...summaries.map(summary => summary.policy ?? 0)], practice: [average(summaries.map(summary => summary.practice)), ...summaries.map(summary => summary.practice ?? 0)] }; const active = Object.fromEntries([...document.querySelectorAll('.radar-series')].map(button => [button.dataset.series, button.classList.contains('active')])); const centerX = width / 2; const centerY = height / 2 - 4; const radius = Math.min(width * .29, 145); const angle = Math.PI * 2 / labels.length; const point = (value, index, extra = 0) => { const currentAngle = index * angle - Math.PI / 2; const distance = radius * (value / 4) + extra; return [centerX + Math.cos(currentAngle) * distance, centerY + Math.sin(currentAngle) * distance]; };
  const drawSeries = (values, color, fill = '') => { const points = values.map((value, index) => point(value, index)); context.beginPath(); points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y)); context.closePath(); if (fill) { context.fillStyle = fill; context.fill(); } context.strokeStyle = color; context.lineWidth = 2; context.stroke(); points.forEach(([x, y]) => { context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fillStyle = color; context.fill(); }); };
  context.font = '10px DM Sans'; context.textAlign = 'center'; context.textBaseline = 'middle';
  for (let level = 1; level <= 4; level += 1) { context.beginPath(); labels.forEach((_, index) => { const [x, y] = point(level, index); index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.closePath(); context.strokeStyle = '#e3ebe6'; context.lineWidth = 1; context.stroke(); context.fillStyle = '#93a49d'; context.fillText(level, centerX + 8, centerY - radius * level / 4); }
  labels.forEach((label, index) => { const [x, y] = point(4, index); context.beginPath(); context.moveTo(centerX, centerY); context.lineTo(x, y); context.strokeStyle = '#e3ebe6'; context.stroke(); const categoryCode = label.match(/\(([^)]+)\)$/)?.[1] || label; const labelOffset = index % 2 ? 25 : 31; const [labelX, labelY] = point(4, index, labelOffset); context.fillStyle = '#536b64'; context.font = '9px DM Sans'; context.fillText(categoryCode, labelX, labelY); });
  if (active.target) { context.setLineDash([5, 4]); drawSeries(series.target, '#d3b55b'); context.setLineDash([]); } if (active.policy) drawSeries(series.policy, '#e89065'); if (active.practice) drawSeries(series.practice, '#267256', 'rgba(38,114,86,.18)');
  canvas.radarPoints = labels.map((label, index) => { const coordinates = point(series.practice[index], index); return { label, policy: series.policy[index], practice: series.practice[index], target: 3, x: coordinates[0], y: coordinates[1] }; });
}
function renderCsfTable() {
  const query = $('csfSearchInput').value.toLowerCase(); const filter = $('csfFunctionFilter').value;
  const rows = allControls().filter(item => (filter === 'all' || item.fn.id === filter) && `${item.fn.name} ${item.name} ${item.code} ${item.category}`.toLowerCase().includes(query));
  $('csfTableBody').innerHTML = rows.map(item => `<tr><td>${item.fn.id}<br>${item.fn.name}</td><td>${item.category || 'CSF Core'}</td><td>${item.subcategory}</td><td>${item.implementation}</td><td>${item.references}</td><td>${attachmentControl(item, 'policy')}</td><td><textarea class="reasoning-input" data-reasoning="policy-${item.id}" placeholder="Why this policy score?"></textarea></td><td>${attachmentControl(item, 'practice')}</td><td><textarea class="reasoning-input" data-reasoning="practice-${item.id}" placeholder="Why this practice score?"></textarea></td></tr>`).join('') || '<tr><td colspan="9">No CSF controls match this filter.</td></tr>';
  document.querySelectorAll('[data-reasoning]').forEach(input => { const key = input.dataset.reasoning; input.value = state.notes[key] || ''; input.addEventListener('input', () => { state.notes[key] = input.value; save(); }); });
  document.querySelectorAll('[data-excel-score]').forEach(button => button.addEventListener('click', () => { const score = Number(button.dataset.excelScore); if (button.dataset.scoreType === 'policy') state.policyScores[button.dataset.control] = score; else state.practiceScores[button.dataset.control] = score; save(); renderCsfTable(); renderOverview(); }));
  document.querySelectorAll('[data-attachment]').forEach(input => input.addEventListener('change', event => uploadAttachment(event.target)));
  document.querySelectorAll('[data-replace-attachment]').forEach(input => input.addEventListener('change', event => replaceAttachment(event.target)));
  document.querySelectorAll('#csfTableBody [data-delete-attachment]').forEach(button => button.addEventListener('click', () => deleteAttachment(button.dataset.deleteAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('#csfTableBody [data-open-attachment]').forEach(button => button.addEventListener('click', () => openAttachment(button.dataset.openAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('#csfTableBody [data-download-attachment]').forEach(button => button.addEventListener('click', () => downloadAttachment(button.dataset.downloadAttachment, Number(button.dataset.attachmentIndex))));
}
function attachmentRecords() {
  return Object.entries(state.attachments || {}).flatMap(([key, attachments]) => {
    const separator = key.indexOf('-'); const kind = key.slice(0, separator); const controlId = key.slice(separator + 1); const item = allControls().find(control => control.id === controlId);
    if (!item || !Array.isArray(attachments)) return [];
    return attachments.map((attachment, index) => ({ ...attachment, key, index, kind, item }));
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
function renderUploadedFiles() {
  const query = $('uploadedFileSearch').value.toLowerCase(); const kindFilter = $('uploadedFileKindFilter').value;
  const records = attachmentRecords().filter(record => { const item = record.item; const text = `${record.name} ${record.path} ${item.fn.name} ${item.category} ${item.subcategory}`.toLowerCase(); return (kindFilter === 'all' || record.kind === kindFilter) && text.includes(query); });
  const total = attachmentRecords().length; $('uploadedFileCount').textContent = `${total} file${total === 1 ? '' : 's'}`;
  $('uploadedFilesBody').innerHTML = records.map(record => `<tr><td><strong class="uploaded-file-name" title="${escapeHtml(record.path)}">${escapeHtml(record.name)}</strong><small>${escapeHtml(record.path)}</small></td><td><span class="function-badge">${record.item.fn.id}</span>${escapeHtml(record.item.fn.name)}</td><td>${escapeHtml(categoryLabel(record.item.category || 'CSF Core'))}</td><td>${escapeHtml(record.item.name)}</td><td><span class="file-kind ${record.kind}">${record.kind === 'policy' ? 'Policy' : 'Practice'}</span></td><td>${record.updatedAt ? new Date(record.updatedAt).toLocaleDateString('id-ID') : '-'}</td><td><div class="file-actions"><button class="attachment-action-button" type="button" data-open-attachment="${record.key}" data-attachment-index="${record.index}">Open</button><button class="attachment-action-button" type="button" data-download-attachment="${record.key}" data-attachment-index="${record.index}">Download</button><button class="attachment-action-button danger" type="button" data-delete-attachment="${record.key}" data-attachment-index="${record.index}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="empty-files">Belum ada file yang diupload.</td></tr>';
  document.querySelectorAll('#uploadedFilesBody [data-delete-attachment]').forEach(button => button.addEventListener('click', () => deleteAttachment(button.dataset.deleteAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('#uploadedFilesBody [data-open-attachment]').forEach(button => button.addEventListener('click', () => openAttachment(button.dataset.openAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('#uploadedFilesBody [data-download-attachment]').forEach(button => button.addEventListener('click', () => downloadAttachment(button.dataset.downloadAttachment, Number(button.dataset.attachmentIndex))));
}
async function useExistingAttachment(targetKey, sourceKey, sourceIndex) {
  const sourceAttachment = (state.attachments[sourceKey] || [])[sourceIndex]; if (!sourceAttachment) return;
  try {
    if (!uploadDirectoryHandle && !(await restoreUploadDirectoryHandle(true))) { $('saveState').textContent = 'Pilih folder upload terlebih dahulu'; return; }
    const targetId = targetKey.slice(targetKey.indexOf('-') + 1); const targetItem = allControls().find(control => control.id === targetId); if (!targetItem) return;
    const sourceHandle = await getAttachmentHandle(sourceKey, sourceAttachment); if (!sourceHandle) { $('saveState').textContent = 'File sumber tidak dapat dibuka'; return; }
    const sourceFile = await sourceHandle.getFile(); const targetDirectory = await uploadDirectoryHandle.getDirectoryHandle(targetItem.fn.name, { create: true }); const targetKind = targetKey.startsWith('policy-') ? 'Policy' : 'Practice'; const targetKindDirectory = await targetDirectory.getDirectoryHandle(targetKind, { create: true }); const targetHandle = await targetKindDirectory.getFileHandle(sourceFile.name, { create: true }); const writable = await targetHandle.createWritable(); await writable.write(sourceFile); await writable.close();
    const metadata = { name: sourceFile.name, path: `upload/${targetItem.fn.name}/${targetKind}/${sourceFile.name}`, size: sourceFile.size, type: sourceFile.type, updatedAt: new Date().toISOString() }; const targetAttachments = state.attachments[targetKey] || []; const existing = targetAttachments.findIndex(attachment => attachment.name === metadata.name); if (existing >= 0) targetAttachments[existing] = metadata; else targetAttachments.push(metadata); state.attachments[targetKey] = targetAttachments; attachmentHandles.set(`${targetKey}-${metadata.name}`, targetHandle); save(); renderCsfTable(); renderUploadedFiles(); if ($('assessmentView').classList.contains('active-view')) renderControls();
  } catch (error) { $('saveState').textContent = 'File gagal digunakan'; }
}
async function chooseUploadFolder() {
  if (!('showDirectoryPicker' in window)) { $('uploadFolderState').textContent = 'Browser tidak mendukung folder picker'; return; }
  try { uploadDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); await saveUploadDirectoryHandle(uploadDirectoryHandle); await ensureUploadStructure(); localStorage.setItem(uploadFolderStorageKey, uploadDirectoryHandle.name); syncUploadFolderStatus(`Folder: ${uploadDirectoryHandle.name}`); } catch (error) { if (error.name !== 'AbortError') syncUploadFolderStatus('Folder tidak dapat dibuka'); }
}
async function ensureUploadStructure() { for (const fn of functions) { const functionDirectory = await uploadDirectoryHandle.getDirectoryHandle(fn.name, { create: true }); await functionDirectory.getDirectoryHandle('Policy', { create: true }); await functionDirectory.getDirectoryHandle('Practice', { create: true }); } }
const updateUploadProgress = (key, percent, message, status = '') => document.querySelectorAll(`[data-progress-key="${key}"]`).forEach(progress => { progress.className = `upload-progress ${status}`; progress.querySelector('.upload-progress-track i').style.width = `${percent}%`; progress.querySelector('small').textContent = message; });
async function uploadAttachment(input) {
  const files = [...input.files]; if (!files.length) return;
  const key = input.dataset.attachment; const functionName = input.dataset.function; const kind = input.dataset.kind;
  try {
    updateUploadProgress(key, 2, 'Starting...'); if (!uploadDirectoryHandle && !(await restoreUploadDirectoryHandle(true))) { updateUploadProgress(key, 100, 'Failed', 'fail'); syncUploadFolderStatus('Pilih ulang folder upload untuk menulis file'); return; }
    const functionDirectory = await uploadDirectoryHandle.getDirectoryHandle(functionName, { create: true }); const kindDirectory = await functionDirectory.getDirectoryHandle(kind === 'policy' ? 'Policy' : 'Practice', { create: true }); const attachments = state.attachments[key] || [];
    for (const [index, file] of files.entries()) { const fileHandle = await kindDirectory.getFileHandle(file.name, { create: true }); const writable = await fileHandle.createWritable(); await writable.write(file); await writable.close(); const metadata = { name: file.name, path: `upload/${functionName}/${kind === 'policy' ? 'Policy' : 'Practice'}/${file.name}`, size: file.size, type: file.type, updatedAt: new Date().toISOString() }; const existing = attachments.findIndex(attachment => attachment.name === file.name); if (existing >= 0) attachments[existing] = metadata; else attachments.push(metadata); attachmentHandles.set(`${key}-${file.name}`, fileHandle); updateUploadProgress(key, Math.round((index + 1) / files.length * 100), `${index + 1}/${files.length}`); }
    state.attachments[key] = attachments; save(); renderCsfTable(); renderUploadedFiles(); if ($('assessmentView').classList.contains('active-view')) renderControls(); setTimeout(() => updateUploadProgress(key, 100, 'Success', 'success'), 0);
  } catch (error) { updateUploadProgress(key, 100, 'Failed', 'fail'); $('saveState').textContent = 'Upload gagal'; }
  input.value = '';
}
async function replaceAttachment(input) { const key = input.dataset.replaceAttachment; const index = Number(input.dataset.attachmentIndex); const oldAttachment = (state.attachments[key] || [])[index]; await uploadAttachment({ files: input.files, dataset: { attachment: key, function: input.dataset.function, kind: input.dataset.kind } }); const attachments = state.attachments[key] || []; const replacementIndex = attachments.findIndex(attachment => attachment.name === input.files[0]?.name); if (replacementIndex >= 0 && replacementIndex !== index) { attachments.splice(index, 1); const moved = attachments.splice(replacementIndex > index ? replacementIndex - 1 : replacementIndex, 1)[0]; attachments.splice(index, 0, moved); state.attachments[key] = attachments; save(); renderCsfTable(); renderUploadedFiles(); } if (oldAttachment && oldAttachment.name !== input.files[0]?.name) attachmentHandles.delete(`${key}-${oldAttachment.name}`); }
async function getAttachmentHandle(key, attachment) { const cacheKey = `${key}-${attachment.name}`; let handle = attachmentHandles.get(cacheKey); if (handle) return handle; if (!uploadDirectoryHandle && !(await restoreUploadDirectoryHandle(true))) return null; const functionName = key.slice(key.indexOf('-') + 1); const item = allControls().find(control => control.id === functionName); if (!item) return null; const functionDirectory = await uploadDirectoryHandle.getDirectoryHandle(item.fn.name); const kind = key.startsWith('policy-') ? 'Policy' : 'Practice'; const directory = await functionDirectory.getDirectoryHandle(kind); handle = await directory.getFileHandle(attachment.name); attachmentHandles.set(cacheKey, handle); return handle; }
async function openAttachment(key, index) { const attachment = (state.attachments[key] || [])[index]; if (!attachment) return; const handle = await getAttachmentHandle(key, attachment); if (!handle) { $('saveState').textContent = 'Pilih ulang folder untuk membuka'; return; } const file = await handle.getFile(); const url = URL.createObjectURL(file); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
async function downloadAttachment(key, index) { const attachment = (state.attachments[key] || [])[index]; if (!attachment) return; const handle = await getAttachmentHandle(key, attachment); if (!handle) { $('saveState').textContent = 'Pilih ulang folder untuk download'; return; } const file = await handle.getFile(); const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = attachment.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function deleteAttachment(key, index) { const attachments = state.attachments[key] || []; const attachment = attachments[index]; if (!attachment || !confirm(`Hapus lampiran ${attachment.name}?`)) return; const handle = attachmentHandles.get(`${key}-${attachment.name}`); if (handle?.remove) handle.remove().catch(() => {}); attachments.splice(index, 1); state.attachments[key] = attachments; attachmentHandles.delete(`${key}-${attachment.name}`); save(); renderCsfTable(); renderUploadedFiles(); }
function showAssessment(id) {
  activeFunction = id; const fn = functions.find(item => item.id === id); document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('assessmentView').classList.add('active-view'); $('assessmentTitle').textContent = fn.name; $('assessmentDescription').textContent = fn.description; $('assessmentKicker').textContent = `${fn.id} / NIST CSF CORE`; renderControls(); saveUiState('assessment', id); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.function === id));
}
function renderControls() {
  const fn = functions.find(item => item.id === activeFunction); const controls = controlsFor(fn); const filtered = controls.filter(item => { const query = $('searchInput').value.toLowerCase(); const score = scoreFor(item.id); const filter = $('statusFilter').value; return item.name.toLowerCase().includes(query) && (filter === 'all' || (filter === 'unscored' && score === null) || (filter === 'scored' && score !== null) || (filter === 'gaps' && (score === null || score < 3))); });
  const scored = controls.filter(item => scoreFor(item.id) !== null).length; $('functionProgress').textContent = `${scored} / ${controls.length}`; $('functionMeter').style.width = `${controls.length ? scored / controls.length * 100 : 0}%`;
  $('controlList').innerHTML = filtered.map(item => `<div class="control-row"><div><div class="control-code">${item.code}</div><div class="control-title">${item.name}</div><div class="control-question">Isi dua nilai terpisah untuk Policy Maturity dan Practice Maturity.</div></div><div><div class="assessment-score-group"><span class="eyebrow">Policy Evidence</span>${attachmentControl(item, 'policy')}</div><div class="assessment-score-group practice"><span class="eyebrow">Practice Evidence</span>${attachmentControl(item, 'practice')}</div></div><div><div class="action-note-group"><span class="eyebrow">Policy Action Notes</span><input class="notes-input" data-note="policy-${item.id}" placeholder="Add policy action note..."></div><div class="action-note-group practice"><span class="eyebrow">Practice Action Notes</span><input class="notes-input" data-note="practice-${item.id}" placeholder="Add practice action note..."></div></div></div>`).join('') || '<div class="control-row">No controls match this filter.</div>';
  document.querySelectorAll('[data-note]').forEach(input => { const controlId = input.dataset.note.replace(/^(policy|practice)-/, ''); const legacyNote = state.notes[controlId]; input.value = state.notes[input.dataset.note] || legacyNote || ''; input.addEventListener('input', () => { state.notes[input.dataset.note] = input.value; save(); }); });
  document.querySelectorAll('[data-assessment-score]').forEach(button => button.addEventListener('click', () => { const score = Number(button.dataset.assessmentScore); if (button.dataset.scoreType === 'policy') state.policyScores[button.dataset.control] = score; else state.practiceScores[button.dataset.control] = score; save(); renderControls(); renderOverview(); }));
  document.querySelectorAll('[data-attachment]').forEach(input => input.addEventListener('change', event => uploadAttachment(event.target)));
  document.querySelectorAll('[data-replace-attachment]').forEach(input => input.addEventListener('change', event => replaceAttachment(event.target)));
  document.querySelectorAll('[data-delete-attachment]').forEach(button => button.addEventListener('click', () => deleteAttachment(button.dataset.deleteAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('[data-open-attachment]').forEach(button => button.addEventListener('click', () => openAttachment(button.dataset.openAttachment, Number(button.dataset.attachmentIndex))));
  document.querySelectorAll('[data-download-attachment]').forEach(button => button.addEventListener('click', () => downloadAttachment(button.dataset.downloadAttachment, Number(button.dataset.attachmentIndex))));
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const fileData = JSON.parse(reader.result);
      const imported = fileData.assessment || fileData;
      if (!imported || typeof imported !== 'object' || typeof imported.scores !== 'object' || typeof imported.notes !== 'object') throw new Error('Invalid assessment file');
      state = normalizeState(imported);
      localStorage.setItem(storageKey, JSON.stringify(state));
      if (fileData.uploadFolderName) localStorage.setItem(uploadFolderStorageKey, fileData.uploadFolderName);
      if (fileData.ui) localStorage.setItem(uiStorageKey, JSON.stringify(fileData.ui));
      if (fileData.uploadFolderName) syncUploadFolderStatus(`Folder: ${fileData.uploadFolderName} - pilih ulang untuk akses file`);
      renderOverview(); renderCsfTable(); renderUploadedFiles();
      $('assessmentView').classList.remove('active-view');
      $('overviewView').classList.add('active-view');
      $('saveState').textContent = 'Progress dan path evidence berhasil diimport';
    } catch (error) {
      $('saveState').textContent = 'JSON tidak valid';
    }
  };
  reader.readAsText(file);
}
function exportData() {
  const fileData = JSON.stringify({ framework: 'NIST CSF 2.0', exportVersion: 2, exportedAt: new Date().toISOString(), uploadFolderName: localStorage.getItem(uploadFolderStorageKey) || '', ui: { view: uiState.view, function: activeFunction }, assessment: state }, null, 2);
  const blob = new Blob([fileData], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'nist-csf-2.0-assessment.json';
  link.click();
  URL.revokeObjectURL(link.href);
  $('saveState').textContent = 'JSON berhasil diexport';
}
async function clearUploadedFiles() {
  if (!uploadDirectoryHandle && !(await restoreUploadDirectoryHandle(true))) return false;
  const entries = [];
  for await (const entry of uploadDirectoryHandle.values()) entries.push(entry.name);
  for (const entryName of entries) await uploadDirectoryHandle.removeEntry(entryName, { recursive: true });
  const remainingEntries = [];
  for await (const entry of uploadDirectoryHandle.values()) remainingEntries.push(entry.name);
  if (remainingEntries.length) throw new Error(`Folder masih berisi ${remainingEntries.length} entry`);
  return true;
}
async function chooseResetFolder() {
  if (!('showDirectoryPicker' in window)) throw new Error('Browser tidak mendukung pemilihan folder');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: uploadDirectoryHandle || undefined });
  uploadDirectoryHandle = handle; await saveUploadDirectoryHandle(handle); await ensureUploadStructure(); syncUploadFolderStatus(`Folder: ${handle.name}`); return handle;
}
async function reset() {
  if (!confirm('WARNING: Reset assessment akan menghapus semua progress, catatan, dan file yang sudah diupload. Tindakan ini tidak dapat dibatalkan. Lanjutkan?')) return;
  $('saveState').textContent = 'Menghapus progress dan file...';
  try {
    await chooseResetFolder();
    const filesCleared = await clearUploadedFiles();
    if (!filesCleared) throw new Error('Folder upload belum dipilih atau izinnya tidak tersedia');
    state = { scores: {}, policyScores: {}, practiceScores: {}, notes: {}, attachments: {} }; attachmentHandles.clear(); save(); renderOverview(); renderCsfTable(); renderUploadedFiles(); if ($('assessmentView').classList.contains('active-view')) renderControls();
    const clearedFolderName = uploadDirectoryHandle.name; await removeSavedUploadDirectoryHandle(); uploadDirectoryHandle = null; localStorage.removeItem(uploadFolderStorageKey); syncUploadFolderStatus('Folder not selected');
    $('saveState').textContent = `Assessment dan semua isi folder ${clearedFolderName} berhasil direset`;
  } catch (error) { $('saveState').textContent = `Reset gagal: ${error.message}`; }
}
renderOverview(); renderCsfTable(); renderUploadedFiles();
const storedUploadFolderName = localStorage.getItem(uploadFolderStorageKey); if (storedUploadFolderName) syncUploadFolderStatus(`Folder: ${storedUploadFolderName}`);
restoreUploadDirectoryHandle().then(restored => { if (!restored && storedUploadFolderName) syncUploadFolderStatus(`Folder: ${storedUploadFolderName} - izin diperlukan`); });
$('startButton').addEventListener('click', () => showAssessment('GV')); $('backButton').addEventListener('click', () => { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('overviewView').classList.add('active-view'); saveUiState('overview'); document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active')); }); $('importButton').addEventListener('click', () => $('importInput').click()); $('importInput').addEventListener('change', event => { if (event.target.files[0]) importData(event.target.files[0]); event.target.value = ''; }); $('exportButton').addEventListener('click', exportData); $('resetButton').addEventListener('click', reset); $('searchInput').addEventListener('input', renderControls); $('statusFilter').addEventListener('change', renderControls);
document.querySelector('[data-view="overview"]').addEventListener('click', () => { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('overviewView').classList.add('active-view'); saveUiState('overview'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'overview')); });
window.addEventListener('storage', event => { if (event.key === storageKey) { state = loadState(); renderOverview(); renderCsfTable(); renderUploadedFiles(); if ($('assessmentView').classList.contains('active-view')) renderControls(); } });
loadDefaultFile().then(loaded => { if (loaded) { renderOverview(); renderCsfTable(); renderUploadedFiles(); $('saveState').textContent = 'File lokal dimuat'; } });
$('csfSearchInput').addEventListener('input', renderCsfTable); $('csfFunctionFilter').addEventListener('change', renderCsfTable); $('csfAssessmentButton').addEventListener('click', () => showAssessment('GV')); document.querySelector('[data-view="csf"]').addEventListener('click', () => { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('csfView').classList.add('active-view'); saveUiState('csf'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'csf')); renderCsfTable(); });
$('uploadedFileSearch').addEventListener('input', renderUploadedFiles); $('uploadedFileKindFilter').addEventListener('change', renderUploadedFiles); document.querySelector('[data-view="files"]').addEventListener('click', () => { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('filesView').classList.add('active-view'); saveUiState('files'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'files')); renderUploadedFiles(); });
$('uploadFolderButton').addEventListener('click', chooseUploadFolder); $('assessmentUploadFolderButton').addEventListener('click', chooseUploadFolder);
document.addEventListener('click', event => { const toggle = event.target.closest('[data-toggle-existing]'); if (toggle) { const picker = document.querySelector(`[data-existing-picker="${toggle.dataset.toggleExisting}"]`); picker?.classList.toggle('visible'); picker?.querySelector('input')?.focus(); } const option = event.target.closest('[data-use-existing]'); if (option) { useExistingAttachment(option.dataset.useExisting, option.dataset.sourceKey, Number(option.dataset.sourceIndex)); } const pageButton = event.target.closest('[data-existing-page]'); if (pageButton && !pageButton.disabled) { const picker = document.querySelector(`[data-existing-picker="${pageButton.dataset.existingPage}"]`); const search = picker?.querySelector('[data-existing-search]'); renderExistingPicker(pageButton.dataset.existingPage, search?.value || '', Number(pageButton.dataset.page)); } });
document.addEventListener('input', event => { const search = event.target.closest('[data-existing-search]'); if (!search) return; renderExistingPicker(search.dataset.existingSearch, search.value, 1); });
window.addEventListener('resize', renderRadar);
document.querySelectorAll('.radar-series').forEach(button => button.addEventListener('click', () => { button.classList.toggle('active'); renderRadar(); }));
 $('maturityRadar').addEventListener('mousemove', event => { const canvas = event.currentTarget; const rectangle = canvas.getBoundingClientRect(); const scaleX = canvas.width / (window.devicePixelRatio || 1) / rectangle.width; const scaleY = canvas.height / (window.devicePixelRatio || 1) / rectangle.height; const x = (event.clientX - rectangle.left) * scaleX; const y = (event.clientY - rectangle.top) * scaleY; const nearest = (canvas.radarPoints || []).map(point => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) })).sort((a, b) => a.distance - b.distance)[0]; const tooltip = $('radarTooltip'); if (!nearest || nearest.distance > 18) { tooltip.style.display = 'none'; return; } const displayScore = value => value === null ? '-' : value.toFixed(1); tooltip.innerHTML = `<strong>${escapeHtml(nearest.label)}</strong><br>Policy: ${displayScore(nearest.policy)}<br>Practice: ${displayScore(nearest.practice)}<br>Target: 3.0`; tooltip.style.display = 'block'; tooltip.style.left = `${Math.min(event.clientX - rectangle.left + 14, rectangle.width - 150)}px`; tooltip.style.top = `${Math.max(event.clientY - rectangle.top - 55, 4)}px`; });
$('maturityRadar').addEventListener('mouseleave', () => { $('radarTooltip').style.display = 'none'; });
 $('maturityRadar').addEventListener('click', event => { const canvas = event.currentTarget; const rectangle = canvas.getBoundingClientRect(); const scaleX = canvas.width / (window.devicePixelRatio || 1) / rectangle.width; const scaleY = canvas.height / (window.devicePixelRatio || 1) / rectangle.height; const x = (event.clientX - rectangle.left) * scaleX; const y = (event.clientY - rectangle.top) * scaleY; const nearest = (canvas.radarPoints || []).map(point => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) })).sort((a, b) => a.distance - b.distance)[0]; const match = allControls().find(item => item.category && item.category.startsWith(nearest?.label)); if (nearest?.distance < 28 && match) showAssessment(match.fn.id); });
if (uiState.view === 'assessment' && functions.some(fn => fn.id === activeFunction)) showAssessment(activeFunction); else if (uiState.view === 'csf') document.querySelector('[data-view="csf"]').click(); else if (uiState.view === 'files') document.querySelector('[data-view="files"]').click(); else saveUiState('overview');