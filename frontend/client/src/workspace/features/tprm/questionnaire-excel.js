let questionnaireExcelRow = null, questionnaireExcelPreview = null;
async function downloadQuestionnaireExcel(url, fallback, status) {
  try {
    if(status)status.textContent='Preparing Excel...';
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error || 'Export Excel failed');
    const filename=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || fallback;
    const blob=await response.blob(),link=document.createElement('a'),objectUrl=(window.NistFileLimits?.exportUrl.bind(window.NistFileLimits) || URL.createObjectURL)(blob);
    link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    if(status)status.textContent='Excel exported';
  } catch(error) {if(status)status.textContent=error.message;else alert(error.message);}
}
function exportVendorQuestionnaireExcel(id,templateId) {
  const query=templateId ? `?templateId=${encodeURIComponent(templateId)}` : '';
  return downloadQuestionnaireExcel(`/api/tprm-questionnaires/${id}/excel${query}`,`TPRM-Vendor-${id}.xlsx`,$('questionnaireAssessmentModal').open ? $('questionnaireAssessmentStatus') : $('questionnaireExcelListStatus'));
}
function openQuestionnaireExcelImport(id) {
  const row=questionnaireRows.find(item=>String(item.id)===String(id));
  if(!row)return;
  if(!canPerform('tprm-questionnaire','update'))return;
  questionnaireExcelRow=row;questionnaireExcelPreview=null;
  const modal=$('questionnaireExcelModal');if(modal.parentElement!==document.body)document.body.appendChild(modal);
  $('questionnaireExcelForm').reset();$('questionnaireExcelApply').disabled=true;$('questionnaireExcelApply').hidden=false;$('questionnaireExcelPreview').replaceChildren();
  $('questionnaireExcelTitle').textContent=`Import Excel · ${row.vendorName}`;$('questionnaireExcelStatus').textContent='Pilih file Excel untuk pratinjau';
  if(!modal.open)modal.showModal();
}
async function previewQuestionnaireExcel() {
  const file=$('questionnaireExcelFile').files[0],row=questionnaireExcelRow;
  questionnaireExcelPreview=null;$('questionnaireExcelApply').disabled=true;$('questionnaireExcelApply').hidden=false;$('questionnaireExcelPreview').replaceChildren();
  if(!file||!row)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>8*1024*1024){$('questionnaireExcelStatus').textContent='Gunakan satu file .xlsx maksimum 8 MB.';return;}
  const form=new FormData();form.append('file',file);
  $('questionnaireExcelStatus').textContent='Membaca Excel...';
  try {
    const response=await fetch(`/api/tprm-questionnaires/${row.id}/excel/preview`,{method:'POST',body:form});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'Pratinjau gagal');
    // Ignore a result for a file or vendor that was replaced while the request was in flight.
    if(questionnaireExcelRow!==row||$('questionnaireExcelFile').files[0]!==file||!$('questionnaireExcelModal').open)return;
    questionnaireExcelPreview=body;
    $('questionnaireExcelPreview').innerHTML=`<article class="insight-panel"><div class="section-heading compact"><div><p class="eyebrow">IMPORT PREVIEW</p><h3>${escapeHtml(body.vendorName)}</h3><p class="muted">${escapeHtml(body.templateName)}</p></div></div><div class="risk-register-grid"><p><strong>${body.total}</strong> pertanyaan</p><p><strong>${body.updated}</strong> baris isian akan diimport</p><p><strong>${body.skipped}</strong> baris kosong dilewati</p></div><p class="muted">${body.completeAnswers} baris import memiliki jawaban dan keterangan lengkap. Skor internal, dokumen yang sudah diunggah, dan catatan internal tetap tersimpan. Approval sebelumnya perlu direview ulang setelah perubahan.</p>${body.respondent.name ? `<p>Responden: ${escapeHtml(body.respondent.name)}</p>` : ''}<div class="excel-wrap"><table class="excel-table"><thead><tr><th>Bagian</th><th>Pertanyaan</th><th>Diimport</th></tr></thead><tbody>${body.sections.map(section=>`<tr><td>${escapeHtml(section.name)}</td><td>${section.total}</td><td>${section.updated}</td></tr>`).join('')}</tbody></table></div></article>`;
    $('questionnaireExcelApply').disabled=!body.updated&&!body.respondentUpdated;$('questionnaireExcelStatus').textContent='Pratinjau siap';
  } catch(error) {if(questionnaireExcelRow===row&&$('questionnaireExcelFile').files[0]===file)$('questionnaireExcelStatus').textContent=error.message;}
}
async function importQuestionnaireExcel(event) {
  event.preventDefault();const file=$('questionnaireExcelFile').files[0],preview=questionnaireExcelPreview,row=questionnaireExcelRow;
  if(!file||!preview||!row)return;
  const form=new FormData();form.append('file',file);form.append('expectedRevision',String(preview.expectedRevision));
  $('questionnaireExcelStatus').textContent='Importing...';
  try {
    const response=await fetch(`/api/tprm-questionnaires/${row.id}/excel`,{method:'POST',body:form});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'Import gagal');
    await loadQuestionnaires();
    if($('questionnaireAssessmentModal').open&&String($('questionnaireAssessmentId').value)===String(row.id))startQuestionnaire(body.record);
    $('questionnaireExcelStatus').textContent=`${body.preview.updated} baris diimport; assessment perlu review.`;
    questionnaireExcelPreview=null;$('questionnaireExcelApply').disabled=true;$('questionnaireExcelApply').hidden=true;
  } catch(error) {$('questionnaireExcelStatus').textContent=error.message;}
}
$('questionnaireBody').addEventListener('click',event=>{
  const exportButton=event.target.closest('[data-questionnaire-excel-export]');if(exportButton)exportVendorQuestionnaireExcel(exportButton.dataset.questionnaireExcelExport);
  const importButton=event.target.closest('[data-questionnaire-excel-import]');if(importButton)openQuestionnaireExcelImport(importButton.dataset.questionnaireExcelImport);
});
$('templateBody').addEventListener('click',event=>{const button=event.target.closest('[data-template-excel-export]');if(button)downloadQuestionnaireExcel(`/api/questionnaire-templates/${button.dataset.templateExcelExport}/excel`,'TPRM-Template.xlsx',$('templateModal').open ? $('templateStatus') : null);});
$('questionnaireExportExcel').addEventListener('click',()=>exportVendorQuestionnaireExcel($('questionnaireAssessmentId').value,$('questionnaireAssessmentForm').dataset.templateId));
$('questionnaireImportExcel').addEventListener('click',()=>openQuestionnaireExcelImport($('questionnaireAssessmentId').value));
$('questionnaireExcelFile').addEventListener('change',previewQuestionnaireExcel);
$('questionnaireExcelForm').addEventListener('submit',guardFormSubmission(importQuestionnaireExcel));
$('questionnaireExcelCancel').addEventListener('click',()=>{$('questionnaireExcelModal').close();questionnaireExcelPreview=null;});
