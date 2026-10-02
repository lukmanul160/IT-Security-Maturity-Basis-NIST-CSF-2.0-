<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="riskAcceptanceView" class="view">
          <div class="page-heading"><div><p class="eyebrow">CYBERSECURITY GOVERNANCE</p><h2>Risk Acceptance</h2><p class="lede">Dokumentasikan permintaan penerimaan risiko siber dan simpan persetujuannya di database.</p></div><span class="file-count" id="riskAcceptanceCount">0 forms</span></div>
          <div class="risk-management-tabs" role="tablist" aria-label="Risk Acceptance">
            <button id="riskAcceptanceDashboardTab" class="button button-accent" type="button" role="tab" aria-selected="true" aria-controls="riskAcceptanceDashboardPanel" data-risk-acceptance-tab="dashboard">Dashboard</button>
            <button id="riskAcceptanceListTab" class="button button-quiet" type="button" role="tab" aria-selected="false" tabindex="-1" aria-controls="riskAcceptanceListPanel" data-risk-acceptance-tab="list">List Risk Acceptance</button>
          </div>
          <p id="riskAcceptancePageStatus" class="save-state" role="status" aria-live="polite"></p>
          <div id="riskAcceptanceDashboardPanel" role="tabpanel" aria-labelledby="riskAcceptanceDashboardTab">
            <div class="section-heading"><div><p class="eyebrow">OVERVIEW</p><h3>Ringkasan Risk Acceptance</h3><p class="muted">Status berdasarkan keputusan Business Owner dan CIS.</p></div></div>
            <div class="risk-dashboard-grid">
<article class="stat-panel"><span class="stat-label">Total permintaan</span><strong id="riskAcceptanceTotal">0</strong><span class="stat-detail">Seluruh risk acceptance</span></article>
<article class="stat-panel"><span class="stat-label">Disetujui</span><strong id="riskAcceptanceApproved">0</strong><span class="stat-detail">Business Owner menerima dan CIS approved</span></article>
<article class="stat-panel"><span class="stat-label">Bersyarat</span><strong id="riskAcceptanceConditional">0</strong><span class="stat-detail">Business Owner menerima dan CIS conditional</span></article>
<article class="stat-panel"><span class="stat-label">Ditolak</span><strong id="riskAcceptanceDenied">0</strong><span class="stat-detail">Ditolak oleh Business Owner atau CIS</span></article>
            </div>
          </div>
          <div id="riskAcceptanceListPanel" role="tabpanel" aria-labelledby="riskAcceptanceListTab" hidden>
            <div class="csf-actions"><button id="riskAcceptanceNew" type="button" class="button button-accent">Tambah Risk Acceptance</button></div>
          <div class="section-heading"><div><p class="eyebrow">SAVED REQUESTS</p><h3>Risk acceptance forms</h3></div><span class="muted">Open a saved form to update it</span></div>
          <div class="excel-wrap"><table class="excel-table risk-acceptance-table"><thead><tr><th>Requestor</th><th>Asset</th><th>Department</th><th>Business Owner</th><th>CIS</th><th>Updated</th><th>Actions</th></tr></thead><tbody id="riskAcceptanceBody"></tbody></table><div class="assessment-pagination" id="riskAcceptancePagination"></div></div>
</div>
          <dialog id="riskAcceptanceModal" class="risk-acceptance-modal" aria-labelledby="riskAcceptanceModalTitle">
<div class="section-heading"><h3 id="riskAcceptanceModalTitle">Tambah Risk Acceptance</h3><button type="button" class="button button-quiet" id="riskAcceptanceClose">Tutup</button></div>
<form id="riskAcceptanceForm" class="risk-acceptance-form">
            <input id="riskAcceptanceId" type="hidden">
            <div class="risk-document-page"><div class="risk-document-header"><h3>Cybersecurity Risk Acceptance Form</h3><span>Version 1.1</span></div><p class="risk-document-intro">Cybersecurity risk acceptance is a deliberate executive decision by a business owner to acknowledge and accept a cybersecurity risk which, for the reason given, cannot be remediated through available security controls and measures.</p><p class="risk-document-intro">Using this form, the application, service, or system owner describes the risk to be accepted, its potential impact, why it should be accepted, and mitigating factors, if any.</p><div class="section-heading compact"><div><p class="eyebrow">REQUEST DETAILS</p><h3>Application, Service or System Operational Owner</h3></div><span class="muted" id="riskAcceptanceStatus">New form</span></div>
            <div class="csf-form-grid"><label>Name of Requestor<input id="riskRequestorName" required maxlength="160"></label><label>Asset Name<input id="riskAssetName" required maxlength="200"></label><label>Department<input id="riskDepartment" required maxlength="160"></label><label class="checkbox-field"><span>Previous acceptance</span><span><input id="riskPreviouslyAccepted" type="checkbox"> This risk was accepted previously</span></label></div>
            <div class="risk-form-grid"><label>Description of Risk and/or Compliance Deviation<textarea id="riskDescription" required rows="5"></textarea></label><label>Benefit and Justification for Accepting this Risk<textarea id="riskBenefitJustification" required rows="5"></textarea></label><label>Factors that Minimize this Risk / Proposed Mitigation Plan<textarea id="riskMitigationPlan" required rows="5"></textarea></label></div>
            </div>

            <div class="risk-document-page"><div class="risk-form-section"><div class="section-heading compact"><div><p class="eyebrow">BUSINESS OWNER ACCEPTANCE</p><h3>Maximum one year</h3></div></div><div class="risk-choice-grid"><label><span>Decision</span><select id="riskBusinessOwnerDecision" required><option value="temporary">Yes, for a temporary period</option><option value="one_year">Yes, for up to one year</option><option value="denied">No, request denied</option></select></label><label><span>Risk will be remediated by</span><input id="riskRemediationDate" type="date"></label></div><div class="csf-form-grid"><label>Requestor name (print)<input id="riskRequestorPrintName"></label><label>Email / Telephone<input id="riskRequestorEmailPhone"></label><label>Signature<input id="riskRequestorSignature"></label><label>Date<input id="riskRequestorDate" type="date"></label></div></div>

            <div class="risk-form-section"><div class="section-heading compact"><div><p class="eyebrow">CIO ACKNOWLEDGEMENT</p><h3>CIO or equivalent</h3></div></div><label class="risk-wide-field">Comments (if any)<textarea id="riskCioComments" rows="4"></textarea></label><div class="csf-form-grid"><label>Name<input id="riskCioName"></label><label>Signature<input id="riskCioSignature"></label><label>Date<input id="riskCioDate" type="date"></label></div></div>
            </div>

            <div class="risk-document-page"><div class="risk-form-section"><div class="section-heading compact"><div><p class="eyebrow">CIS REVIEW</p><h3>Cybersecurity Team decision</h3></div></div><div class="risk-choice-grid"><label><span>Decision</span><select id="riskCisDecision" required><option value="approved">Approved</option><option value="denied">Denied</option><option value="conditional">Approved with conditions / comments</option></select></label><label>Reason (if denied)<textarea id="riskCisReason" rows="3"></textarea></label><label>Conditions / comments<textarea id="riskCisConditions" rows="3"></textarea></label></div><div class="csf-form-grid"><label>Name<input id="riskCisName"></label><label>Signature<input id="riskCisSignature"></label><label>Date<input id="riskCisDate" type="date"></label></div></div>
            </div>
            <div class="csf-form-actions"><button class="button button-accent" type="submit" id="riskAcceptanceSubmit">Save risk acceptance form</button><button class="button button-quiet" type="button" id="riskAcceptanceCancel">Tutup</button><span class="save-state" id="riskAcceptanceFormStatus">Ready</span></div>
          </form>
          </dialog>
<dialog id="riskAcceptanceDeleteModal" class="risk-acceptance-modal risk-acceptance-delete-modal" aria-labelledby="riskAcceptanceDeleteTitle">
<h3 id="riskAcceptanceDeleteTitle">Hapus Risk Acceptance</h3><p id="riskAcceptanceDeleteMessage"></p><p class="save-state" role="status" id="riskAcceptanceDeleteStatus"></p>
<div class="csf-form-actions"><button type="button" class="button button-danger" id="riskAcceptanceDeleteConfirm">Hapus</button><button type="button" class="button button-quiet" id="riskAcceptanceDeleteCancel">Batal</button></div>
</dialog>
        </section>
</template>
<style>
.risk-acceptance-modal{width:min(1100px,calc(100vw - 32px));max-height:90vh;margin:auto;padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--paper,#fff);color:var(--ink);overflow:auto;box-shadow:0 24px 80px #0f172a33}
.risk-acceptance-modal::backdrop{background:rgba(15,23,42,.55)}
.risk-acceptance-modal .risk-acceptance-form{margin-bottom:0}
.risk-acceptance-delete-modal{max-width:480px}
.risk-acceptance-delete-modal p{margin-top:16px}
@media(max-width:650px){.risk-acceptance-modal{padding:12px}}
</style>
