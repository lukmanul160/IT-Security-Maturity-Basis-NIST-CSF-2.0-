# TPRM lifecycle

The TPRM Risk Register keeps the existing dashboard, vendor table, CIA forms, questionnaire templates, evidence upload and related-risk picker. Each vendor now has a **Workflow** action, with Assessment, Review, Approval, Activation & Monitoring, Offboarding and History panels.

## Workflow and roles

1. Create a vendor questionnaire and register its service dependency. New relationships start as **Pending**. Existing active relationships remain available and display a validation warning until reviewed through the workflow.
2. Complete the internal owner and criticality profile. Rate data sensitivity, system access, business impact and replacement difficulty from 1–3. The highest rating determines criticality; it is separate from security risk.
3. Complete the saved questionnaire template, including a Yes/No/N/A decision and explanation for every question, supporting documents, four due diligence scores and all nine CIA indicators. N/A needs an explanation. Link identified risks and complete their residual ratings, or explain why no gaps were identified.
4. Submit for review. Admin, editor or approver verifies evidence, records its review/expiry date, evaluates critical access, encryption, incident and continuity controls, and records mitigation actions with owners and due dates. Failed critical controls require mitigation and block approval. The reviewer can return the assessment with an explanation.
5. A different admin or approver records Approved, Approved with Conditions or Rejected. Accepted risks need a future approval expiry; high residual risk also needs an acceptance rationale. Conditional approval needs open mitigation actions with future deadlines and access restrictions.
6. Activate only after contract security, incident, audit, subprocessor and data-exit obligations are verified. All pre-activation conditions need completion evidence. Next review must be future dated and no later than approval or evidence expiry.
7. Record monitoring and completion evidence for existing actions. Reassess on scheduled review, changed services or incidents. Changing the assessment, questionnaire evidence, related risk ratings or criticality invalidates the reviewed version. Active relationships remain active while reassessment is pending, with warnings; they do not automatically receive renewed approval.
8. Start offboarding with a reason. A reviewer verifies access revocation, data disposition and outstanding obligations, selects an uploaded vendor document as closure evidence, then closes as Offboarded or Terminated. Closed records cannot be edited or deleted through normal register actions.

General register editing cannot set relationship state, approve assessments, or reschedule reviews. Questionnaire forms cannot directly issue approval. Write actions still require the existing page permissions; reviewer and approver role restrictions are additionally enforced by the server.

## Scoring and history

Server code recalculates CIA and due diligence scores from valid integer indicators. Incomplete inputs remain **Incomplete / Not assessed**. Inherent risk uses the highest CIA-derived or linked inherent risk. Residual risk uses the highest linked residual rating; an absent residual rating stays unknown. With no identified gaps, the documented no-gap assessment uses the CIA-derived risk score. Critical control failures independently block acceptance, regardless of numeric score.

These criticality rules, risk scales and thresholds are application policy choices, not mandatory NIST formulas. They should be aligned with the organization's risk appetite. The lifecycle follows the supplier risk management concepts in NIST CSF 2.0 GV.SC / SP 1305; implementing it does not itself establish organizational compliance.

Workflow events persist actor, timestamp and an assessment snapshot, including questionnaire, controls, mitigation and related risks. Questionnaire revisions are retained separately. History displays the assessed values and evidence references without overwriting previous versions. Uploaded document retention remains governed by the existing evidence-library administration.

## Offline vendor questionnaires

Use **Export Excel** on a vendor assessment, in its questionnaire dialog, or on a questionnaire template. Exports include Panduan, Vendor, Kuesioner and hidden matching metadata. A vendor export binds the workbook to the assessment ID, vendor name, template version and response revision. A generic template export has a blank vendor name that must be filled to match the intended assessment.

Vendors fill the highlighted respondent, Yes/No/N/A, explanation and evidence-reference cells offline. The workbook has answer dropdowns, wrapped text, frozen headers and protected question/identity cells. It excludes uploaded evidence paths, internal scores, reviewer decisions and approval details. Vendors send the workbook and supporting document files to the internal team; no vendor login is required.

Use **Import Excel** on the matching vendor to preview the counts by section, then apply the import. Completely blank answer rows do not overwrite stored responses. Filled rows replace that row's decision, explanation and evidence reference. Respondent information imports separately. Invalid answers, formulas, unknown/duplicate/missing question IDs, changed question text and mismatched vendors are rejected. Answer changes made in the system after export cause a conflict; internal score or document updates alone do not invalidate unchanged offline answers. A revision check also prevents changes between preview and import. Input is limited to one .xlsx file of 8 MB and 2000 questions.

Import preserves uploaded evidence, internal scores and internal record fields, records a questionnaire revision, and sets In progress / Pending. A previously reviewed version becomes stale and must pass the normal workflow again. Filename references are displayed in the questionnaire but do not constitute uploaded or verified evidence.

## Verification

- `npm run test:tprm`: scoring, completeness, criticality, residual risk, fingerprint and date checks plus existing TPRM/template tests.
- `npm run test:tprm-integration`: lifecycle and API permission gates using PostgreSQL TEMP tables on one dedicated connection; operational tables are shadowed and never read or changed.
- `npm run test:tprm-browser`: real source component/handlers in Chrome with a fixture API; assignment payloads, readonly access, actor-specific actions, dependency fields and contract fields. It does not test deployment, email delivery or every live application page.


## Assigned governance and stronger activation gates

The register now has **3. Reviewer & Approver**, and each vendor workflow has a
**Reviewer & Approver** tab. An administrator selects three distinct existing accounts:
requester (any role with TPRM Update), reviewer (editor/approver/admin with Update),
and approver (approver/admin with Update). Only those assigned users may submit/activate,
review/return/monitor/close, and approve respectively. Assignment changes invalidate the
prior review and approval, preserve history, and retain Offboarding if already in progress.
There is no administrative bypass for acting as an assigned reviewer or approver.

High residual risk (>=70) requires a linked Risk Acceptance record, not only free text.
The form must have accepted business-owner/CIS decisions, the existing three signature/name/date
fields completed, a future remediation date, and conditions when conditional. The approval
cannot outlive that acceptance. The approver must have Risk Acceptance Read permission and
record how its scope covers the vendor/linked risk. A version hash is saved and rechecked
before activation; changed/deleted/expired acceptance blocks activation and is shown as invalid.
This reuses the existing Risk Acceptance form model; it does not introduce cryptographic
signature verification or a new identity-verified signing workflow for that module.

Review policy defaults are 90 days for critical/high-residual-risk vendors, 180 days for
important vendors, and 365 days for standard vendors. These are application policy choices,
not mandatory NIST intervals. Empty next-review dates are calculated on activation; a manually
selected date may be earlier, but may not exceed the policy, approval, evidence, or contract
expiry. Day boundaries use Asia/Bangkok. Incident, service/data/access change, financial
trouble, and subvendor changes can be recorded as reassessment triggers. Active relationships
are not silently disabled while reassessment is pending.

Activation requires a signed-contract evidence reference selected from vendor documents
and still registered in evidence_files, signing/expiry dates, an SLA target, incident
notification hours, and numeric RTO/RPO. Only noncritical vendors may justify RTO/RPO N/A.
The registered evidence check does not inspect a signature's authenticity or contact cloud
storage during the workflow transaction. Existing contract checkboxes remain mandatory.

Profiles capture subvendor/provider name, service, data location, owner, criticality and
replacement/exit plan, or a reason that no dependencies apply. Shared named providers
across vendors are surfaced in the governance tab; this is an inventory-based concentration
indicator, not automatic fourth-party discovery or a comprehensive concentration score.
Declaring a critical dependency elevates vendor criticality to Tier 1.

The governance tab displays in-app reminders for the next 30 days and overdue escalation
to the assigned approver. It does not send emails or revoke external vendor access.
No operational assignments, acceptance forms, or relationships are migrated automatically.
Legacy vendors require explicit assignments and the new fields before the next transition.
Backend updates require a restart; changing assignments later does not require one.

Verification results: 373 application regression tests passed (5 skipped), focused TPRM
rules passed, PostgreSQL TEMP-table lifecycle/API gates passed, Chrome source-UI fixture
passed, and frontend build passed. The local Node server was restarted and /login returned
HTTP 200. Existing vendor records and assignments were not changed during verification.
Legacy test-tprm-workflow integration/browser entry points forward to the current fixtures.

## Framework, entry guide and tiering reference

Sidebar order: TPRM Framework, Flow Pengisian TPRM, Vendor Tiering Matrix.
The Framework summarizes the implemented governance gates; the Entry Flow provides
ten steps with the responsible actor, destination page, required inputs and outcome;
the Tiering Matrix distinguishes criticality (1-3), due diligence (100-500), CIA (20-100)
and residual risk (0-100), including critical-dependency elevation and 90/180/365-day
review policy. These are application rules, not a claim of mandatory NIST scoring.
The guide shares TPRM Framework Read permission and does not create new role settings.
Destination shortcuts honor each target module permission. Reading the guide does not
fetch operational records or advance vendor workflow. Sidebar selection persists on reload.

Entry-guide verification: 15 focused tests passed; the application suite passed
373 tests with 5 skipped. Chrome fixtures verified navigation, permissions, language,
mobile/dark layout and no operational API requests. Frontend build passed.
These checks did not exercise a live vendor approval or alter operational records.
