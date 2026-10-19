Security review: Surat Pernyataan and Policy Register Word editor
Date: 17 October 2026 (Asia/Bangkok)

Implemented protections:
- DOCX uploads: stream validation of actual ZIP expansion (25 MB, 600 entries, compressed upload 5 MB), duplicate names and forged size rejection, all-part XML validation, external relationship checks after XML entity decoding, dangerous field checks including headers/footers and split runs, blocked macros/embedded objects/HTML/SVG.
- Employee imports: archive validation before parsing XLSX at the upload endpoint.
- Authentication: new accounts receive random inaccessible hashes until admin password setup. NIP passwords and reset-to-NIP are rejected, old session policy versions are invalidated, password reset revokes sessions, cookies follow the application's Secure setting, account and IP request limits cover login/preview/submission.
- Portal CSP and no-store responses; signatures redacted from audit records.
- Policy editor: update permission and evidence ownership enforced, Draft status and exact revision rechecked under a row lock at save, a new file version avoids modifying shared original attachments. The live editor exports directly so export errors cannot silently save the old file. Missing optional DOCX parts are supplied for editor compatibility.

Validation:
- npm audit --omit=dev: 0 reported vulnerabilities.
- 42 targeted security, document, policy, permission, audit and localization unit tests passed; final DOCX validation regression (12 tests) also passed.
- Transaction-isolated statement integration test.
- Chrome statement editor/employee portal/signature and policy editor/save/version-conflict tests.
- Production client build.

Known limits:
- This review cannot guarantee absence of all vulnerabilities and is not an external penetration test or Office antivirus/CDR scan.
- Request limits are per Node process; deployments with multiple instances need a shared limiter at the proxy or application layer.
- The existing global i18nCoverage test reports untranslated/unchanged labels across unrelated pages (including Account, Budget, and sidebar); targeted i18n tests pass. This work does not resolve the global translation inventory.
- Running backend processes must be restarted to load route/security changes. Existing default-NIP users need admin password setup; users must sign in again after session-policy migration.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
