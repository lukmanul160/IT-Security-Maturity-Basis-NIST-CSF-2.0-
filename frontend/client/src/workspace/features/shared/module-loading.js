/**
 * State, akses, startup, navigasi dan utilitas lintas fitur.
 * Classic-script berbagi lexical scope; .mjs adalah ES module mandiri. Load data hanya ketika modul dibuka.
 * Peta fungsi/dependency: docs/source-catalog.json; panduan lokal: README.md.
 */
// Load assessment data only when its view needs it. Failed loads remain retryable.
const moduleInitialLoads = new Map();
/** Bagikan request awal yang masih pending untuk modul yang sama; kegagalan dapat dicoba lagi saat modul dibuka. */
function ensureModuleData(view) {
  const group = ['csf', 'assessment', 'csf-manage', 'overview'].includes(view) ? 'csf'
    : ['privacy', 'privacy-assessment', 'privacy-manage'].includes(view) ? 'privacy'
    : view === 'files' ? 'files' : null;
  if (!group) return Promise.resolve();
  if (moduleInitialLoads.has(group)) return moduleInitialLoads.get(group);
  const pending = Promise.resolve().then(async () => {
    if (group === 'csf') {
      if (!await loadDefaultFile()) throw new Error('Assessment database unavailable');
      await loadCsfData();
    } else if (group === 'privacy') {
      await loadPrivacyData();
      if ($('privacyAssessmentView').classList.contains('active-view')) renderPrivacyAssessment($('privacyAssessmentTitle').textContent);
    } else {
      await Promise.all([ensureModuleData('csf'), ensureModuleData('privacy'), loadIso27001Data(), loadIso27001SoaData(), loadPolicyRegisterRows(), refreshEvidenceLibrary()]);
      renderUploadedFiles();
    }
  }).catch(error => { moduleInitialLoads.delete(group); throw error; });
  moduleInitialLoads.set(group, pending);
  return pending;
}
