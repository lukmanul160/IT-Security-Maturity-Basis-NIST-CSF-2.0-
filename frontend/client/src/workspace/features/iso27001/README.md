# iso27001

Kontrol clauses, SOA, evidence dan sasaran keamanan informasi.

## Alur dan batas tanggung jawab

Kontrol dan SOA memakai framework/izin terpisah; progress sasaran mengikuti periode evaluasi tersimpan.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [controls-and-evidence.js](controls-and-evidence.js) | `isoEvidenceSources`, `styleIsoEvidencePicker`, `isoEvidencePicker`, `useExistingIsoEvidence`, `isoEvidenceCell`, `isoNotesCell` |
| [objectives-and-soa.js](objectives-and-soa.js) | `objectiveMeasurement`, `objectivePeriods`, `objectiveNumber`, `objectiveProgress`, `objectiveTargetLabel`, `refreshObjectiveProgress` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/USER_GUIDE.md`, `docs/assessment-gaps.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
