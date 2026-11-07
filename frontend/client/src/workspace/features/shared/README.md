# shared

State, akses, startup, navigasi dan utilitas lintas fitur.

## Alur dan batas tanggung jawab

Classic-script berbagi lexical scope; .mjs adalah ES module mandiri. Load data hanya ketika modul dibuka.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [action-access.js](action-access.js) | `applyActionControls` |
| [dashboard-help.js](dashboard-help.js) | `dashboardExplain`, `installDashboardHelp` |
| [event-bindings.js](event-bindings.js) | State / binding / ekspor modul; lihat katalog AST |
| [governance-dashboard.js](governance-dashboard.js) | `gdToday`, `gdDate`, `gdDays`, `gdReviewMatches`, `gdOptions`, `gdBars` |
| [import-export.js](import-export.js) | `importData`, `exportData` |
| [module-loading.js](module-loading.js) | `ensureModuleData` |
| [module-transfer.js](module-transfer.js) | `recordTransferActivity`, `runAuditedTransfer`, `mountProgressExcel`, `mountIkasProgressExcel`, `mountMaturityExcel` |
| [noteEditor.mjs](noteEditor.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [noteImageExtension.mjs](noteImageExtension.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [noteImages.mjs](noteImages.mjs) | `normalize` |
| [noteImport.mjs](noteImport.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [noteLinks.mjs](noteLinks.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [noteNavigation.mjs](noteNavigation.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [noteSearch.mjs](noteSearch.mjs) | `fieldsFor`, `matchedFields` |
| [noteTree.mjs](noteTree.mjs) | State / binding / ekspor modul; lihat katalog AST |
| [reminder-preview.js](reminder-preview.js) | State / binding / ekspor modul; lihat katalog AST |
| [reminder-recipients.js](reminder-recipients.js) | `attachOwnerSmtpLinks` |
| [startup.js](startup.js) | `resetFramework`, `resetIso27001Assessment`, `reportOfficeModule` |
| [state-and-access.js](state-and-access.js) | `canPerform`, `openUploadHandleDb`, `saveUploadDirectoryHandle`, `removeSavedUploadDirectoryHandle`, `getSavedUploadDirectoryHandle`, `restoreUploadDirectoryHandle` |
| [submission-guard.js](submission-guard.js) | `guardFormSubmission` |
| [threat-navigation.js](threat-navigation.js) | `showThreatModelling`, `showBudget` |
| [wikiCompletion.mjs](wikiCompletion.mjs) | State / binding / ekspor modul; lihat katalog AST |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/CODE_STRUCTURE.md`, `docs/monitoring-dashboard.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
