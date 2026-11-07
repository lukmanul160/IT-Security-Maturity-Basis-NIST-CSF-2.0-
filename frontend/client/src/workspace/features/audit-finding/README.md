# audit-finding

Register temuan audit, detail, evidence dan reminder.

## Alur dan batas tanggung jawab

Index record membantu lookup folder; lampiran tetap mengikuti izin Files dan mutasi mengikuti izin modul.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [detail-view.js](detail-view.js) | `renderAuditFindingDetails` |
| [record-index.js](record-index.js) | `createAuditRecordIndex` |
| [tracker.js](tracker.js) | State / binding / ekspor modul; lihat katalog AST |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/audit-finding-tracker.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
