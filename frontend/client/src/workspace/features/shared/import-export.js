function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const fileData = JSON.parse(reader.result);
      const imported = fileData.assessment || fileData;
      if (!imported || typeof imported !== 'object' || typeof imported.scores !== 'object' || typeof imported.notes !== 'object') throw new Error('Invalid assessment file');
      const nextState = normalizeState(imported);
      if(fileData.gaps!==undefined) {
        await moduleTransfer.importPayload('csf',{format:'nist-basis-module',version:1,module:'csf',data:{assessment:nextState,gaps:fileData.gaps}});
      } else {
      const response = await fetch('/api/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextState) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Penyimpanan assessment gagal');
      }
      await recordTransferActivity('import', 'assessment', file.name);
      state = nextState;
      await loadAssessmentGaps('csf');
      if (fileData.uploadFolderName) localStorage.setItem(uploadFolderStorageKey, fileData.uploadFolderName);
      if (fileData.ui) localStorage.setItem(uiStorageKey, JSON.stringify(fileData.ui));
      if (fileData.uploadFolderName) syncUploadFolderStatus(`Folder: ${fileData.uploadFolderName} - pilih ulang untuk akses file`);
      renderOverview(); renderCsfTable(); renderUploadedFiles();
      $('assessmentView').classList.remove('active-view');
      $('csfView').classList.add('active-view');
      $('saveState').textContent = 'Progress dan path evidence berhasil diimport';
    } catch (error) {
      $('saveState').textContent = `Import gagal: ${error.message}`;
    }
  };
  reader.readAsText(file);
}
async function exportData() {
  let gaps;
  try {const response=await fetch('/api/assessment-gaps/csf',{cache:'no-store'});if(!response.ok)throw new Error((await response.json()).error||'Export gap gagal');gaps=await response.json();}catch(error){$('saveState').textContent=error.message;return;}
  try { await recordTransferActivity('export', 'assessment', 'nist-csf-2.0-assessment.json'); } catch (error) { $('saveState').textContent = error.message; return; }
  const fileData = JSON.stringify({ framework: 'NIST CSF 2.0', exportVersion: 3, exportedAt: new Date().toISOString(), uploadFolderName: localStorage.getItem(uploadFolderStorageKey) || '', ui: { view: uiState.view, function: activeFunction }, assessment: state, gaps }, null, 2);
  const blob = new Blob([fileData], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'nist-csf-2.0-assessment.json';
  link.click();
  URL.revokeObjectURL(link.href);
  $('saveState').textContent = 'JSON berhasil diexport';
}
