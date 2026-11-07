/**
 * Adapter tampilan: ubah panduan menjadi HTML yang di-escape dan shortcut tab.
 * Membaca aktor/izin runtime; tidak menyimpan data atau menjalankan transisi.
 */
function tprmNextStepsHtml(data, tab) {
  const steps=tprmNextSteps(data,tab,tprmLifecycleActor,canPerform('tprm-register','update'),tprmCriticalLabels);
  const targets={assignments:'Reviewer & Approver',assessment:'Assessment',review:'Review',approval:'Approval',monitoring:'Activation & Monitoring',offboarding:'Offboarding',history:'History'};
  return steps.length ? `<aside class="insight-panel tprm-next-steps" aria-label="Panduan langkah TPRM"><h4>Langkah berikutnya dan syarat untuk lanjut</h4><ul>${steps.map(step=>`<li><p>${escapeHtml(step.message)} ${targets[step.target] && step.target!==tab ? `<button type="button" class="attachment-action-button" data-tw-navigate="${step.target}">Buka ${targets[step.target]}</button>` : ''}</p></li>`).join('')}</ul></aside>` : '';
}
