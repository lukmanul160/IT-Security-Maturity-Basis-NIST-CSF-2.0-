# personnel

Struktur organisasi, personel, sertifikasi dan katalog roadmap.

## Alur dan batas tanggung jawab

Perubahan relasi atasan dan file sertifikat mengikuti validasi server; drag/resize tetap mempertahankan ID personel/sertifikasi.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [certifications.js](certifications.js) | `renderCertificationReference`, `moveRoadmapCatalogItem`, `saveRoadmapCatalog`, `deleteRoadmapCatalog`, `loadCertifications`, `saveCertification` |
| [organization-and-forms.js](organization-and-forms.js) | `exportOrganizationPng`, `canManagePersonnelCertifications`, `applyPersonnelAccess`, `setCertificationEditable`, `setPersonnelCertificationTab`, `renderOrganizationStructure` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/USER_GUIDE.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
