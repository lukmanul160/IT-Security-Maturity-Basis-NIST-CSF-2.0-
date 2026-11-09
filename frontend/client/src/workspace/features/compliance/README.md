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

Compliance Security Checklist memakai komponen Vue reaktif
`../../components/SecurityChecklistView.vue`, dengan event security-checklist-open.
Dashboard merangkum assignment; tab Assignment Checklist membuat assignment dari
template + judul aplikasi + assessor; tab Buat Checklist mengelola template tanpa
assessor. Seluruh form memakai native dialog/showModal. Snapshot assignment dan
file tidak dibagi dengan aplikasi lain. Backend memeriksa izin, aktor dan versi.

Excel template berada di `../../../services/securityChecklistWorkbook.mjs`.
File mempertahankan metadata kolom, impor menjadi draft, tidak membuat assignment
atau membawa file biner. Evidence memakai multipart dan BYTEA PostgreSQL.
UI memakai NistI18n.t reaktif; data pengguna tidak diterjemahkan.
Jalankan `npm run test:security-checklist`, `npm run test:security-checklist-browser`,
`node --test test/i18n.test.js`, struktur/katalog dan build setelah perubahan.
