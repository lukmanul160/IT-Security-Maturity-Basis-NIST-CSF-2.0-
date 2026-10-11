// UI controls mirror server action permissions; ownership remains a separate check.
const actionControlRules = [
  ['assessment','delete','#csfTopResetButton'],['privacy-assessment','delete','#privacyResetButton'],['iso27001','delete','#iso27001ResetButton'],['risk-management','delete','#riskRegisterResetButton'],
  ['assessment','update','#assessmentView [data-delete-attachment],#csfView [data-delete-attachment],#assessmentView [data-attachment],#csfView [data-attachment],#assessmentView [data-replace-attachment],#csfView [data-replace-attachment]'],
  ['privacy-assessment','update','#privacyView [data-delete-attachment],#privacyAssessmentView [data-delete-attachment],#privacyView [data-attachment],#privacyAssessmentView [data-attachment],#privacyView [data-replace-attachment],#privacyAssessmentView [data-replace-attachment]'],
  ['iso27001','update','[data-list-evidence-delete^="clauses|"],[data-list-evidence-upload="clauses"],[data-list-evidence-replace^="clauses|"],[data-use-iso-existing^="clauses|"],[data-iso-notes^="clauses|"],[data-iso-existing-search^="clauses|"]'],
  ['iso27001-soa','update','[data-list-evidence-delete^="soa|"],[data-list-evidence-upload="soa"],[data-list-evidence-replace^="soa|"],[data-use-iso-existing^="soa|"],[data-iso-notes^="soa|"]'],
  ['policy-register','update','#policyRegisterFileRemove'],
  ['personnel-certification','create','#organizationPersonnelNewButton,#certificationNewButton,#roadmapCatalogNewButton,[data-organization-certify]'],
  ['personnel-certification','update','[data-organization-edit]'],['personnel-certification','delete','[data-organization-delete],#roadmapCatalogDelete,[data-certification-delete]'],
  ['risk-management','create','#riskDropdownNewButton,[data-option-action="create"]'],['risk-management','update','[data-option-action="update"]'],['risk-management','delete','[data-dropdown-delete]'],
  ['csf','create','#csfManageNewButton,#addCsfButton'],['csf','update','[data-manager-edit],#csfView [data-open-csf-modal]'],['csf','delete','[data-manager-delete],[data-delete-csf-control]'],
  ['privacy','create','#privacyManageNewButton,#addPrivacyButton'],['privacy','update','[data-privacy-edit],#privacyView [data-open-privacy-modal]'],['privacy','delete','[data-privacy-delete],[data-delete-privacy-control]'],
  ['iso27001','create','#iso27001NewButton,#isoObjectiveNewButton'],['iso27001','update','[data-iso-edit],[data-objective-edit],#isoObjectiveCalendarSave'],['iso27001','delete','[data-iso-delete],[data-objective-delete]'],
  ['iso27001-soa','create','#iso27001SoaNewButton'],['iso27001-soa','update','[data-soa-edit],[data-soa-app-toggle]'],['iso27001-soa','delete','[data-soa-delete]'],
  ['risk-acceptance','create','#riskAcceptanceNew'],['risk-acceptance','update','[data-risk-edit]'],['risk-acceptance','delete','[data-risk-delete],#riskAcceptanceDeleteConfirm'],
  ['risk-management','create','#riskManagementNewButton,#riskIndicatorNewButton,#riskRegisterImportInput'],['risk-management','update','[data-rm-edit],[data-indicator-edit]'],['risk-management','delete','[data-rm-delete],[data-indicator-delete]'],
  ['policy-register','create','#policyDropdownAddBtn,#policyDropdownNewOption'],['policy-register','update','.policy-dropdown-option-input'],['policy-register','delete','[data-delete-index]'],
  ['policy-register','create','#policyRegisterNewButton,#policyRegisterAddItem'],['policy-register','update','[data-policy-edit]'],['policy-register','delete','[data-policy-delete],#policyRegisterDelete'],
  ['tprm-register','create','#tprmNewButton'],['tprm-register','update','[data-tprm-edit]'],['tprm-register','delete','[data-tprm-delete],#tprmDelete'],
  ['tprm-questionnaire','create','#questionnaireNewButton,[data-questionnaire-start]'],['tprm-questionnaire','update','[data-questionnaire-edit],[data-questionnaire-decision],#questionnaireAssessmentSave,#questionnaireDocumentUpload,[data-questionnaire-answer],[data-questionnaire-decision-value]'],['tprm-questionnaire','delete','[data-questionnaire-delete],#questionnaireDelete'],
  ['questionnaire-templates','create','#templateNewButton'],['questionnaire-templates','update','[data-template-edit]'],['questionnaire-templates','delete','[data-template-delete],#templateDelete'],
  ['assessment','read','#csfAssessmentButton'],['privacy-assessment','read','#privacyAssessmentButton'],
  ['assessment','update','[data-assessment-score],[data-csf-target-category],#assessmentView textarea,#csfView textarea,#assessmentView [data-use-existing],#csfView [data-use-existing]'],
  ['privacy-assessment','update','[data-privacy-score],[data-privacy-target-category],#privacyAssessmentView textarea,#privacyView textarea,[data-use-privacy-existing]'],
  ['files','read','[data-open-attachment],[data-download-attachment],[data-list-evidence-open],[data-list-evidence-download],[data-questionnaire-document-open],[data-open-library-file],[data-download-library-file],#policyRegisterFileOpen,a[href^="/api/files/"],a[href^="/api/audit-finding-tracker/"][href*="/download"]'],
  ['files','create','#uploadedFilesUploadButton,#uploadedFilesUploadInput,#uploadedFilesUploadKind,#questionnaireDocumentUpload,#policyRegisterFile,#aftFileLabel input[type="file"]'],
  ['files','update','[data-uploaded-file-edit],#uploadedFileEditSubmit,[data-replace-attachment],[data-list-evidence-replace]'],
  ['files','delete','[data-delete-library-file]'],['files','create','[data-attachment],[data-list-evidence-upload]']
];
const actionForms = {
  organizationPersonnelForm:['personnel-certification','organizationPersonnelId'],roadmapCatalogForm:['personnel-certification','roadmapCatalogId'],
  riskDropdownForm:['risk-management','riskDropdownId'],
  csfForm:['csf','csfFormOriginalId'],csfControlModalForm:['csf','csfControlModalOriginalId'],privacyForm:['privacy','privacyFormOriginalId'],privacyControlModalForm:['privacy','privacyControlModalOriginalId'],
  iso27001Form:['iso27001','iso27001OriginalId'],iso27001SoaForm:['iso27001-soa','iso27001SoaOriginalId'],isoObjectiveForm:['iso27001','isoObjectiveId'],
  riskRegisterForm:['risk-management','riskRegisterOriginalId'],riskAcceptanceForm:['risk-acceptance','riskAcceptanceId'],policyRegisterForm:['policy-register','policyRegisterId'],
  tprmForm:['tprm-register','tprmId'],questionnaireForm:['tprm-questionnaire','questionnaireId'],templateForm:['questionnaire-templates','templateId'],certificationForm:['personnel-certification','certificationId']
};
function applyActionControls() {
  if(!Object.keys(currentUserActions).length)return;
  const controls = new Map();
  for(const element of document.querySelectorAll('[data-view]')) { const view=element.dataset.view; if(view==='asset-dashboard'){controls.set(element,!['asset-register','server-racks','asset-modelling'].some(key=>canPerform(key,'read')));continue;} const key=view==='csf-manage' ? 'csf' : view==='privacy-manage' ? 'privacy' : view; if(currentUserActions[key]) controls.set(element,!canPerform(key,'read')); }
  for(const [key,action,selector] of actionControlRules) {
    document.querySelectorAll(selector).forEach(element=>controls.set(element,(controls.get(element) || false) || !canPerform(key,action)));
  }
  for(const element of document.querySelectorAll('#policyRegisterFile,#policyRegisterUseExisting,#policyRegisterFileReplace')) controls.set(element,(controls.get(element) || false) || !canPerform('policy-register',$('policyRegisterId')?.value ? 'update' : 'create'));
  for(const toolbar of document.querySelectorAll('[data-module-transfer]')) {
    const module=toolbar.dataset.moduleTransfer;
    const keys=module==='csf' ? ['assessment'] : module==='privacy' ? ['privacy-assessment'] : module==='personnel' ? ['personnel-certification'] : module==='iso27001' ? ['iso27001','iso27001-soa'] : [module];
    toolbar.querySelectorAll('[data-import],input[type="file"]').forEach(element=>controls.set(element,!keys.every(key=>canPerform(key,'create') || canPerform(key,'update'))));
    toolbar.querySelectorAll('[data-export],[data-report]').forEach(element=>controls.set(element,!keys.every(key=>canPerform(key,'read'))));
  }
  for(const [element,denied] of controls) {
    const field=element.matches('textarea,input:not([type="file"]):not([type="button"]):not([type="submit"]),select');
    if(field) { element.disabled=denied; element.classList.remove('role-action-denied'); }
    else element.classList.toggle('role-action-denied',denied);
    element.dataset.actionDenied=String(denied);
  }
  for(const [id,[key,original]] of Object.entries(actionForms)) {
    const form=$(id); if(!form)continue;
    const denied=!canPerform(key,$(original)?.value ? 'update' : 'create');
    form.querySelectorAll('[type="submit"]').forEach(button=>button.classList.toggle('role-action-denied',denied));
  }
}
let actionControlRefresh = false;
const scheduleActionControls=()=>{
  if(actionControlRefresh)return;
  actionControlRefresh=true;
  queueMicrotask(()=>{actionControlRefresh=false;applyActionControls();});
};
new MutationObserver(scheduleActionControls).observe(document.querySelector('.main-content'),{childList:true,subtree:true});
document.addEventListener('click',scheduleActionControls);
for(const type of ['click','change']) document.addEventListener(type,event=>{
  if(!Object.keys(currentUserActions).length)return;
  // Check at dispatch time too: newly rendered controls may precede the observer refresh.
  applyActionControls();
  if(event.target.closest('[data-action-denied="true"]')) {event.preventDefault();event.stopImmediatePropagation();}
},true);
document.addEventListener('input',scheduleActionControls);
document.addEventListener('submit',event=>{
  const rule=actionForms[event.target.id];
  if(!rule || !Object.keys(currentUserActions).length)return;
  if(!canPerform(rule[0],$(rule[1])?.value ? 'update' : 'create')) {event.preventDefault();event.stopImmediatePropagation();$('saveState').textContent='Role tidak memiliki izin untuk aksi ini.';}
},true);
applyActionControls();
