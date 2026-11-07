# risk-management

Risk register, pilihan, dashboard dan workflow approval/verifikasi.

## Alur dan batas tanggung jawab

Inherent, target residual dan residual aktual berbeda. Transisi memerlukan version, aktor dan keputusan server.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [dashboard.js](dashboard.js) | `rdToday`, `rdDate`, `rdActive`, `rdScore`, `rdHigh`, `rdOverdue` |
| [options.js](options.js) | `renderRiskDropdownManager`, `ensureRiskDropdownManager`, `fillRiskDropdown`, `saveRiskDropdown`, `deleteRiskDropdown`, `setRiskManagementTab` |
| [register.js](register.js) | `riskManagementData`, `riskRatingFromScore`, `updateRiskCalculations`, `synchronizeRiskDropdowns`, `renderRiskDropdownControls`, `nextRiskIdPreview` |
| [workflow-model.js](workflow-model.js) | `rwAvailable`, `rwGuidance`: aturan/panduan; membaca identitas, izin dan tanggal runtime |
| [workflow-view.js](workflow-view.js) | `rwLiveData`, `rwLiveRisk`, `rwApplyHighlights`, `rwRender`: draft, markup dan fokus UI |
| [workflow.js](workflow.js) | `rwRequest`, `rwOpen`, `rwMutate`: state, API dan event |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/risk-workflow.md`, `docs/risk-options.md`, `docs/risk-dashboard.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.

Fixture memakai grup `risk-workflow` dari `runtime-parts.json`, sama dengan urutan aplikasi.
