Assessment gaps
===============

CSF 2.0, Privacy Framework, ISO 27001 clauses and Annex A / SOA support multiple explicit gaps per control. Use the **Gap** button in the existing assessment row to add descriptions, select Open/Closed, and upload or select evidence. Evidence is optional; multiple files may belong to one gap. The dialog shows eight gaps per page.

Each framework also has a **Gap** tab with descriptions, control IDs/titles, status, evidence links, search, status/missing-evidence filters and eight-item pagination. ISO includes both clauses and SOA. Assessment rows preview up to three findings and link to the complete details. The evidence picker supports search by filename, upload source and permitted linked content.

The framework dashboards summarize total, Open, Closed and missing-evidence gaps. KPI buttons open the related gaps; there is no additional raw assessment table on a dashboard. These findings are separate from maturity-score shortfalls and existing score reasoning. Monitoring Dashboard also includes Open/Closed/missing-evidence metrics and counts Open gaps in pending work. It refreshes after a gap changes.

Persistence uses `assessment_gaps` with a foreign key to `controls(framework_id,code)`. Server startup applies `database/assessment-gaps.sql`; restart an already running server after updating the application. Existing assessments are retained and are not converted into invented findings. Control deletion cascades to its gaps; evidence files remain in the central library. Existing score-reset actions retain explicit gap findings.

CRUD endpoints are `/api/assessment-gaps/:framework` (GET), `/:framework/:code` (POST), and `/:framework/:code/:id` (PUT/DELETE). They enforce the assessment module's read, update or delete permissions. PUT/DELETE require the latest `updatedAt` to reject stale changes. Evidence references use the existing uploader ownership rules and canonical library metadata. Central file deletion removes gap references transactionally while preserving descriptions and statuses. The existing request audit middleware records gap changes.

Export, import and backup
------------------------

Module Export JSON, import templates and printable reports include `gaps` for CSF/Privacy/ISO clauses and `soaGaps` for Annex A. The older standalone CSF export now uses `exportVersion: 3` and includes `gaps`. Old module/CSF files without a gap section remain importable and leave existing findings unchanged.

`POST /api/assessment-gaps/:framework/import` imports `{gaps:[...]}` with assessment update permission. It validates every finding and control/file reference before writing, then merges by stable UUID in one transaction. Importing an export again updates the same gaps. Findings omitted from a file are retained; empty arrays do not delete existing findings. Cross-framework/control UUID collisions are rejected. Imported edits record the current authenticated actor and timestamp; the original historical audit trail is preserved through database backup, not forged by imported JSON. A module import can still have earlier sections saved if a later section fails, as reported by the existing import progress/error message.

JSON exports carry evidence references, not file bytes. For transfer to another installation, restore the existing **Backup file ZIP** first, then import assessment/controls and gap data with valid evidence ownership. For a complete recovery, use **Database Backup** (the full PostgreSQL dump includes `assessment_gaps`, UUIDs, timestamps, relationships, constraints and audit events) together with **Backup file ZIP** (binary evidence files, paths and metadata). The database backup alone does not package evidence stored in local/cloud storage.

Validation:

- `npm test`: gap validation, permissions, ownership rejection, distinct findings, stale updates, central evidence deletion and existing application regression tests.
- `npm run test:assessment-gaps-integration`: real API/database round trip with unique fixture controls and one fixture PDF, removed afterward.
- `npm run test:assessment-gaps-browser`: built workspace with isolated in-memory gap API fixtures, four framework entry points, pagination, edit/status flows, KPI drilldown, dark/light, and 1440/768/390px layouts. No existing business data is edited.
