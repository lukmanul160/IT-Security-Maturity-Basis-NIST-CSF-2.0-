/**
 * Adapter form TPRM. Membaca draft DOM hanya saat submit dan membangun payload
 * per aksi; tidak memvalidasi keputusan, mengirim request, atau mengubah workflow.
 */
/** Mitigasi yang tidak ditampilkan memakai snapshot terakhir agar tab lain tidak menghapusnya. */
function readTprmWorkflowPayload(action) {
  const val = id => $(id)?.value || '', checked = id => $(id)?.checked === true;
  const data = { action, conditions: $('twConditions') ? readTprmConditions() : tprmLifecycleData.conditions || [] };
  if (action==='assign') data.assignments=Object.fromEntries(['requester','reviewer','approver'].map(key=>[key,val('twAssign'+key)]));
  if (action === 'save') Object.assign(data,{profile:{owner:val('twOwner'),dataSensitivity:val('twSensitivity'),systemAccess:val('twAccess'),businessImpact:val('twImpact'),replaceability:val('twReplacement'),scope:val('twScope')},noRisksReason:val('twNoRisks'),dependencies:readTprmDependencies(),noDependenciesReason:val('twNoDependencies')});
  if (['review','return'].includes(action)) Object.assign(data,{notes:val('twReviewNotes'),evidenceVerified:checked('twevidenceVerified'),evidenceValidUntil:val('twEvidenceUntil'),criticalControls:Object.fromEntries(Object.keys(tprmCriticalLabels).map(key => [key,{status:val(`twCritical${key}`),notes:val(`twCriticalNotes${key}`)}]))});
  if (action === 'approve') Object.assign(data,{decision:val('twDecision'),notes:val('twApprovalNotes'),expiresAt:val('twApprovalUntil'),riskAcceptance:val('twRiskAcceptance'),riskAcceptanceId:val('twRiskAcceptanceId'),accessLimits:val('twAccessLimits')});
  if (action === 'activate') Object.assign(data,{contract:Object.fromEntries(Object.keys(tprmContractLabels).map(key => [key,checked(`twContract${key}`)])),contractReference:val('twContractReference'),contractDetails:{evidencePath:val('twContractEvidence'),signedDate:val('twContractSigned'),expiresAt:val('twContractExpiry'),sla:val('twContractSla'),notificationHours:val('twIncidentHours'),rtoHours:val('twRto'),rpoHours:val('twRpo'),continuityNA:val('twContinuityNA')},nextReview:val('twNextReview')});
  if (['monitor','reassess'].includes(action)) {data.notes = val('twMonitoringNotes');data.trigger=val('twReviewTrigger');}
  if (['startOffboarding','close'].includes(action)) Object.assign(data,{notes:val('twExitNotes'),exitChecklist:Object.fromEntries(Object.keys(tprmExitLabels).map(key => [key,checked(`twExit${key}`)])),exitEvidencePath:val('twExitEvidence'),relationshipStatus:val('twExitStatus')});
  return data;
}
