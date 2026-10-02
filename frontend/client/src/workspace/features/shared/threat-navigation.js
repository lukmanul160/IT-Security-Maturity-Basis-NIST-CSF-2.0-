function showThreatModelling() {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  $('threatModellingView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'threat-modelling'));
  saveUiState('threat-modelling');
  window.dispatchEvent(new Event('threat-modelling-open'));
}
document.querySelector('[data-view="threat-modelling"]')?.addEventListener('click', showThreatModelling);
if (uiState.view === 'threat-modelling') showThreatModelling();
