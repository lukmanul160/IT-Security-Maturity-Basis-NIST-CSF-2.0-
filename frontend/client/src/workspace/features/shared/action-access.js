// UI controls mirror server action permissions; ownership remains a separate check.
const actionControlRules = [
  ['risk-management','create','#riskDropdownNewButton,[data-option-action="create"]'],['risk-management','update','[data-option-action="update"]'],['risk-management','delete','[data-dropdown-delete]'],
  ['csf','create','#csfManageNewButton,#addCsfButton'],['csf','update','[data-manager-edit],#csfView [data-open-csf-modal]'],['csf','delete','[data-manager-delete],[data-delete-csf-control]'],
  ['privacy','create','#privacyManageNewButton,#addPrivacyButton'],['privacy','update','[data-privacy-edit],#privacyView [data-open-privacy-modal]'],['privacy','delete','[data-privacy-delete],[data-delete-privacy-control]'],
  ['iso27001','create','#iso27001NewButton,#isoObjectiveNewButton'],['iso27001','update','[data-iso-edit],[data-objective-edit],#isoObjectiveCalendarSave'],['iso27001','delete','[data-iso-delete],[data-objective-delete]'],
  ['iso27001-soa','create','#iso27001SoaNewButton'],['iso27001-soa','update','[data-soa-edit]'],['iso27001-soa','delete','[data-soa-delete]'],
  ['risk-acceptance','create','#riskAcceptanceNew'],['risk-acceptance','update','[data-risk-edit]'],['risk-acceptance','delete','[data-risk-delete],#riskAcceptanceDeleteConfirm'],
  ['risk-management','create','#riskManagementNewButton,#riskIndicatorNewButton'],['risk-management','update','[data-rm-edit],[data-indicator-edit]'],['risk-management','delete','[data-rm-delete],[data-indicator-delete]'],
  ['policy-register','create','#policyRegisterNewButton,#policyRegisterAddItem'],['policy-register','update','[data-policy-edit]'],['policy-register','delete','[data-policy-delete],#policyRegisterDelete'],
  ['tprm-register','create','#tprmNewButton'],['tprm-register','update','[data-tprm-edit]'],['tprm-register','delete','[data-tprm-delete],#tprmDelete'],
  ['tprm-questionnaire','create','#questionnaireNewButton'],['tprm-questionnaire','update','[data-questionnaire-edit],[data-questionnaire-decision]'],['tprm-questionnaire','delete','[data-questionnaire-delete],#questionnaireDelete'],
  ['questionnaire-templates','create','#templateNewButton'],['questionnaire-templates','update','[data-template-edit]'],['questionnaire-templates','delete','[data-template-delete],#templateDelete'],
  ['assessment','update','[data-assessment-score],#assessmentView textarea,#csfView textarea,#assessmentView [data-use-existing],#csfView [data-use-existing]'],
  ['privacy-assessment','update','[data-privacy-score],#privacyAssessmentView textarea,#privacyView textarea,[data-use-privacy-existing]'],
  ['files','update','[data-uploaded-file-edit],#uploadedFileEditSubmit,[data-replace-attachment],[data-list-evidence-replace]'],
  ['files','delete','[data-delete-library-file]'],['files','create','[data-attachment],[data-list-evidence-upload]']
];
const actionForms = {
  riskDropdownForm:['risk-management','riskDropdownId'],
  csfForm:['csf','csfFormOriginalId'],csfControlModalForm:['csf','csfControlModalOriginalId'],privacyForm:['privacy','privacyFormOriginalId'],privacyControlModalForm:['privacy','privacyControlModalOriginalId'],
  iso27001Form:['iso27001','iso27001OriginalId'],iso27001SoaForm:['iso27001-soa','iso27001SoaOriginalId'],isoObjectiveForm:['iso27001','isoObjectiveId'],
  riskRegisterForm:['risk-management','riskRegisterOriginalId'],riskAcceptanceForm:['risk-acceptance','riskAcceptanceId'],policyRegisterForm:['policy-register','policyRegisterId'],
  tprmForm:['tprm-register','tprmId'],questionnaireForm:['tprm-questionnaire','questionnaireId'],templateForm:['questionnaire-templates','templateId'],certificationForm:['personnel-certification','certificationId']
};
function applyActionControls() {
  if(!Object.keys(currentUserActions).length)return;
  for(const [key,action,selector] of actionControlRules) {
    const denied=!canPerform(key,action);
    document.querySelectorAll(selector).forEach(element=>{
      if(element.classList.contains('role-action-denied')!==denied)element.classList.toggle('role-action-denied',denied);
    });
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
document.addEventListener('input',scheduleActionControls);
document.addEventListener('submit',event=>{
  const rule=actionForms[event.target.id];
  if(!rule || !Object.keys(currentUserActions).length)return;
  if(!canPerform(rule[0],$(rule[1])?.value ? 'update' : 'create')) {event.preventDefault();event.stopImmediatePropagation();$('saveState').textContent='Role tidak memiliki izin untuk aksi ini.';}
},true);
applyActionControls();
