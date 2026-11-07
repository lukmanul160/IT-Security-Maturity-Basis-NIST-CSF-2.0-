# privacy

Dashboard dan penilaian Privacy Framework.

## Alur dan batas tanggung jawab

Skor policy/practice, target dan evidence memakai konteks Privacy; jangan mencampurkan state dengan CSF.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [assessment.js](assessment.js) | `savePrivacy`, `setPrivacyTab`, `renderPrivacy`, `renderPrivacyRadar`, `showPrivacyAssessment`, `renderPrivacyAssessment` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/USER_GUIDE.md`, `docs/assessment-years.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
