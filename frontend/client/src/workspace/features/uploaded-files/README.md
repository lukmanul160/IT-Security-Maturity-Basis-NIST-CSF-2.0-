# uploaded-files

Pustaka evidence, lampiran, pencarian serta editor file.

## Alur dan batas tanggung jawab

Metadata evidence dan byte file berbeda. Pemilihan file tidak memberi izin baru; penghapusan referensi divalidasi server.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [attachments.js](attachments.js) | `attachmentRecords`, `uploadedLibraryRecords`, `uploadedFileOrigin`, `uploadedFileFormat`, `syncUploadedFileFilter`, `deleteUploadedLibraryFile` |
| [editor-and-events.js](editor-and-events.js) | `editUploadedFile`, `saveUploadedPdfOpenPage`, `openUploadedFileSource`, `replaceUploadedFile`, `uploadLibraryFiles` |
| [evidence-library.js](evidence-library.js) | `selectableEvidenceRecords`, `evidenceReference`, `evidenceMatches`, `evidenceMatchPreview`, `addEvidenceSelectSearch`, `updateEvidencePicker` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/file-storage.md`, `docs/database-backup.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
