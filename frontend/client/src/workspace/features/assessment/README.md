# assessment

Kontrol CSF, skor, gap dan konteks tahun assessment.

## Alur dan batas tanggung jawab

Pisahkan nilai kosong dari nol; filter tahun berlaku pada request dan ID kontrol tetap menjadi kontrak evidence.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [control-editor.js](control-editor.js) | `resetFrameworkControlModal`, `openFrameworkControlModal`, `openCsfControlModal`, `openPrivacyControlModal`, `saveFrameworkControlModal`, `resetCsfForm` |
| [gap-model.js](gap-model.js) | `gapControlTitle`, `gapLinkedDetails`: membaca konteks kontrol tanpa DOM/network |
| [gap-view.js](gap-view.js) | `assessmentGapButton`, `renderGapSummaries`, `renderGapDialog`: markup, tab dan draft evidence |
| [gaps.js](gaps.js) | `gapRows`, `loadAssessmentGaps`, `openAssessmentGaps`: state, API, penyimpanan dan event |
| [overview-and-csf.js](overview-and-csf.js) | `renderOverview`, `setCsfTab`, `renderSummary`, `prepareRadarCanvas`, `renderRadar`, `renderCsfTable` |
| [scoring.js](scoring.js) | `showAssessment`, `renderControls` |
| [years-context.js](years-context.js) | `assessmentGroupForUrl`, `assessmentPeriodsFor` |
| [years-ui.js](years-ui.js) | `canCreateAssessmentYear`, `canDeleteAssessmentYear`, `openDeleteAssessmentYearDialog`, `selectAssessmentYear`, `openAssessmentYearDialog`, `installAssessmentPeriods` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/assessment-gaps.md`, `docs/assessment-years.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.

Fixture memakai grup `assessment-gaps` dari manifest runtime. Edit pada tab Gap tetap hanya menampilkan gap terpilih; navigasi konteks assessment dipertahankan.
