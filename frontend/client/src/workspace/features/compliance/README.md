# compliance

Register kepatuhan, reminder dan penghubung surat pernyataan.

## Alur dan batas tanggung jawab

UI memuat data sesuai halaman; status reminder bukan bukti email sudah terkirim.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [register.js](register.js) | State / binding / ekspor modul; lihat katalog AST |
| [reminder-settings.js](reminder-settings.js) | State / binding / ekspor modul; lihat katalog AST |
| [smtp-settings.js](smtp-settings.js) | State / binding / ekspor modul; lihat katalog AST |
| [statements.js](statements.js) | State / binding / ekspor modul; lihat katalog AST |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/compliance-office-design.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
