# ikas

Assessment IKAS dengan indikator, rubrik, tahun dan evidence.

## Alur dan batas tanggung jawab

Nilai 0 valid; input kosong belum dinilai. Perhitungan resmi aplikasi berada pada src/shared/ikasScoring.js.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [assessment.js](assessment.js) | `ikasStatus`, `ikasRequest`, `saveIkas`, `loadIkas`, `ikasTarget`, `ikasFiltered` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/ikas-assessment.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
