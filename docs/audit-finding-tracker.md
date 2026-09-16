# Audit Finding Tracker

Modul mandiri pada navigasi Assessment map, mengikuti komponen dan kelas UI workspace yang sudah ada. Alur: Audit → Finding → Follow-up → Evidence. Pilih tombol pada baris untuk masuk ke tingkat berikutnya; breadcrumb kembali ke induk.

Setiap tingkat memiliki judul, referensi, PIC, status, tenggat, dan deskripsi. Finding memiliki severity. Evidence wajib memiliki file saat dibuat (maksimum 10 MB); file dapat diganti saat mengubah data. Pencarian dan filter status berlaku pada tingkat yang sedang dibuka. Status dicatat manual, bukan approval otomatis. Induk dengan turunan tidak dapat dihapus.

Permission `audit-finding-tracker`: semua peran dapat membaca jika permission diaktifkan; admin/approver/editor dapat membuat dan mengubah; admin/approver dapat menghapus. Endpoint `/api/audit-finding-tracker` mengikuti autentikasi dan pencatatan audit aplikasi. File evidence tersimpan sebagai BYTEA bersama metadata di tabel PostgreSQL khusus `audit_finding_records`, bukan pada Uploaded files atau konfigurasi penyimpanan modul lain. Unduhan selalu berupa attachment melalui API berizin.

Restart server untuk membuat tabel dan mendaftarkan permission baru. Build frontend: `npm.cmd run build:client`. Unit test: `node --test test/auditFindingService.test.js`. Integration test PostgreSQL menggunakan tabel TEMP: set `RUN_AFT_DB_TESTS=1` sebelum menjalankan test tersebut.

Pengembangan berikutnya: lanjutkan implementasi modul ini dengan mengikuti pola yang sudah ada, jangan sentuh modul lain. Source tampilan: `components/AuditFindingView.vue`; runtime: `features/audit-finding/tracker.js`. Jangan mengedit hasil generated atau membuat template/layout baru.

## Reminder finding

Admin dapat membuka **Pengaturan reminder finding / SMTP Admin** di Audit Finding Tracker. Koneksi memakai `smtpService` terpusat; host, pengirim, dan password tetap di Account > Pengaturan SMTP. Modul hanya menyimpan status aktif, H- (0–365 hari), dan email penerima (satu per baris). Seluruh penerima menerima setiap finding yang memenuhi jadwal, bukan pemetaan otomatis berdasarkan PIC.

Email berisi **Judul** audit dan **Finding**, ditambah deskripsi, PIC, status, serta tenggat. Scheduler setiap jam selama server aktif memproses finding selain Closed yang mempunyai tenggat dalam jendela H- atau sudah lewat. Pengiriman berhasil dicatat sekali per finding/tenggat/penerima; kegagalan dicoba lagi pada pemeriksaan berikutnya. Jika tanggal tenggat diubah, reminder dapat dikirim kembali untuk tanggal baru. Reminder nonaktif secara default. Tombol email percobaan memakai data contoh dan SMTP Admin, tanpa mengaktifkan scheduler.

Tabel khusus: `audit_finding_reminder_settings` dan `audit_finding_reminder_deliveries`. Endpoint `/api/audit-finding-tracker/reminder-settings` (GET/PUT) dan `/test` (POST) hanya untuk Admin. Test: `node --test test/auditFindingReminderService.test.js`; transport email dimock sehingga tidak mengirim email sungguhan.
