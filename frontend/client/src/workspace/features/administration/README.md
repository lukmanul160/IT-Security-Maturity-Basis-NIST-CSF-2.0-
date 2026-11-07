# administration

Akun, audit, backup serta konfigurasi storage/SMTP.

## Alur dan batas tanggung jawab

Perubahan konfigurasi dikirim ke endpoint khusus; backup/restore tidak dipakai sebagai pengujian terhadap data operasional.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [audit-backup-accounts.js](audit-backup-accounts.js) | `loadAuditTrail`, `formatBackupSize`, `loadBackups`, `deleteBackup`, `createBackup`, `renderDatabaseRestoreSelection` |
| [file-backups.js](file-backups.js) | `fileBackupRequest`, `loadFileBackups`, `renderFileBackupFolders`, `loadFileBackupFolders`, `createFileBackup`, `deleteFileBackup` |
| [smtp-settings.js](smtp-settings.js) | `populateSmtpAccountOptions`, `loadGlobalSmtpAccounts`, `globalSmtpRequest`, `populateGlobalSmtp` |
| [storage-settings.js](storage-settings.js) | `fileStorageRequest`, `updateFileStorageFields`, `populateFileStorage`, `submitFileStorage` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/database-backup.md`, `docs/file-storage.md`, `docs/policy-email-reminders.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
