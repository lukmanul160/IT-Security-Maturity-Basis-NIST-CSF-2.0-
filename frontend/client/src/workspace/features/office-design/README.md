# office-design

Editor denah, bentuk, coverage CCTV dan layout kantor.

## Alur dan batas tanggung jawab

State canvas adalah draft; endpoint menyimpan layout. Perhitungan koordinat tidak membuktikan coverage fisik aktual.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [editor.js](editor.js) | State / binding / ekspor modul; lihat katalog AST |
| [shapes.js](shapes.js) | `officeShapeSvg`, `officeExampleLayout`, `officeCctvCoverageSvg` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/compliance-office-design.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
