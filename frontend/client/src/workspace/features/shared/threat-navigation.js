/**
 * State, akses, startup, navigasi dan utilitas lintas fitur.
 * Classic-script berbagi lexical scope; .mjs adalah ES module mandiri. Load data hanya ketika modul dibuka.
 * Peta fungsi/dependency: docs/source-catalog.json; panduan lokal: README.md.
 */
function showThreatModelling() {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  $('threatModellingView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'threat-modelling'));
  saveUiState('threat-modelling');
  window.dispatchEvent(new Event('threat-modelling-open'));
}
document.querySelector('[data-view="threat-modelling"]')?.addEventListener('click', showThreatModelling);
if (uiState.view === 'threat-modelling') showThreatModelling();

function showBudget() {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  $('budgetView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'budget'));
  saveUiState('budget');
  window.dispatchEvent(new Event('budget-open'));
}
document.querySelector('[data-view="budget"]')?.addEventListener('click', showBudget);
if (loadUiState().view === 'budget') showBudget();

// Vue checklist loads only when its permission-checked navigation is opened.
function showSecurityChecklist() {
  if (!canPerform('compliance-security-checklist', 'read')) return;
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  $('securityChecklistView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'compliance-security-checklist'));
  saveUiState('compliance-security-checklist');
  window.dispatchEvent(new Event('security-checklist-open'));
}
document.querySelector('[data-view="compliance-security-checklist"]')?.addEventListener('click', showSecurityChecklist);
workspaceUserReady.then(() => { if (loadUiState().view === 'compliance-security-checklist') showSecurityChecklist(); });

// Technology inventory is independent from the hardware register and loads on demand.
function showTechnologyAsset() {
  if (!canPerform('technology-asset','read')) return;
  document.querySelectorAll('.view').forEach(view=>view.classList.remove('active-view'));
  $('technologyAssetView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.view==='technology-asset'));
  saveUiState('technology-asset');
  window.dispatchEvent(new Event('technology-asset-open'));
}
document.querySelector('[data-view="technology-asset"]')?.addEventListener('click',showTechnologyAsset);
workspaceUserReady.then(()=>{if(loadUiState().view==='technology-asset')showTechnologyAsset();});
