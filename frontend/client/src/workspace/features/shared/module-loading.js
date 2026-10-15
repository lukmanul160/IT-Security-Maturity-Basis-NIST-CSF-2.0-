// Load assessment data only when its view needs it. Failed loads remain retryable.
const moduleInitialLoads = new Map();
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
