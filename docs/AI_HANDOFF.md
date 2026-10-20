# Panduan belajar dan melanjutkan proyek

## Arsitektur

NIST Basis menggunakan Express 5/CommonJS, PostgreSQL, Vue 3, Vite dan Tailwind.
Mulai dari package.json ? src/server.js ? src/app.js ? src/routes/index.js.
Logika domain ada di src/services/; konfigurasi database/environment di src/config/.
Schema dasar ada di database/; banyak service juga menjalankan inisialisasi saat startup.

Frontend: frontend/client/src/workspace/components/ adalah sumber tampilan.
Komponen v-pre memakai event dari workspace/features/ yang dirangkai runtime.js.
Periksa features/shared/ untuk startup, permission dan binding. Build menghasilkan
frontend/public/vue/ dan aset pendukung; jangan mengubah hasil build langsung.

## Menjalankan dengan Node.js

Gunakan Node.js 24, npm dan PostgreSQL (17 untuk kesesuaian default Docker).
Salin env.exsample menjadi .env hanya pada instalasi baru, lalu atur DB_*.
Jalankan npm ci, npm run build, npm run db:setup, lalu npm start.
Windows dapat memakai npm.cmd. URL default http://localhost:8000/login.
Untuk administrator tambahan gunakan npm run admin:create.
Pasang pg_dump/pg_restore dengan versi yang mendukung server; Windows juga
mendeteksi instalasi standar PostgreSQL. PG_DUMP_PATH dan PG_RESTORE_PATH
bisa diatur untuk lokasi lain. Jangan commit .env atau password.

## Menjalankan dengan Docker

Salin docker.env.example ke .env.docker dan isi BLACKOWL_DB_PASSWORD.
Jalankan docker compose --env-file .env.docker up -d --build.
Buka http://localhost:5000/login; periksa docker compose --env-file .env.docker ps.
Dockerfile membangun frontend dan memasang PostgreSQL client 17.
Compose menjalankan PostgreSQL 17 dan volume database/data/upload/backup.
Jangan gunakan down -v kecuali memang ingin menghapus seluruh volume.
Lihat DOCKER.md dan INSTALLATION.md untuk deployment lengkap.

## Backup dan restore

Database: src/services/backupService.js, backupRoutes.js, BackupsView.vue.
pg_dump membuat custom dump seluruh database; pg_restore memakai satu transaksi,
tanpa ketergantungan owner/ACL asal. JSON lama hanya snapshot data.

File: src/services/fileBackupService.js, fileBackupRoutes.js, FileBackupsView.vue,
features/administration/file-backups.js. ZIP berisi manifest dan path asli.
Versi 2 mendukung batch serta pecahan satu file besar; seluruh bagian wajib
tersedia ketika restore. Batas tiap ZIP 500 MiB. Storage tujuan mengikuti
konfigurasi aktif, termasuk local/S3/GCS. Backup hanya mencakup file yang
terdaftar di evidence_files, bukan sembarang folder filesystem server.

Pemilihan folder backup mencakup induk dan seluruh turunannya. UI menyediakan
tombol tiap path dan Semua folder. POST /api/file-backups/inspect menerima
multipart backups dan mengembalikan folder dari manifest ZIP tanpa menulis
storage aktif. Ekstraksi sementara dibersihkan. Daftar restore tidak bergantung
pada folder yang masih ada di server. Inspeksi memerlukan upload ZIP; restore
mengunggah ulang dan memvalidasi seluruh batch sebelum menulis.

Pulihkan database terlebih dahulu (login ulang bila diminta), kemudian pilih
semua ZIP dari batch file yang sama, pilih Semua folder atau path dalam backup,
lalu restore. File kembali ke path asal, file dengan path sama diganti, file
lain tidak dihapus. Kegagalan storage saat penulisan bisa menghasilkan restore
sebagian; baca pesan hasil dan ulangi sesudah storage pulih. Konfigurasi server,
kredensial cloud, dan kunci harus diamankan terpisah.

## Verifikasi perubahan

- npm run build
- node --test test/backupService.test.js test/fileBackupService.test.js test/storageService.test.js test/dockerDataInitialization.test.js test/sessionCookieConfig.test.js
- npm run test:file-backup-browser (memerlukan PostgreSQL lokal dan Chrome)
- npm test untuk regresi lebih luas.

Test service memakai fixture/mock: keberhasilannya bukan bukti koneksi cloud
nyata. Untuk penerimaan deployment lakukan backup/restore pada instalasi uji
terpisah, cocokkan jumlah/baris database serta hash file sebelum dan sesudah.
Jangan menguji restore ke data operasional. Pada lingkungan tanpa Docker,
validasi image dan uji migrasi lintas Node/Docker harus dilakukan di host Docker.

### Pemilihan beberapa folder

Backup dan restore mendukung checkbox beberapa folder. Panah membuka/tutup
cabang; label hanya menampilkan nama folder dan tooltip menampilkan path lengkap.
Induk yang dicentang mencakup semua turunannya (checkbox turunan dikunci);
lepas centang induk untuk memilih subfolder terpisah. Tanpa pilihan, server
menolak operasi. API menerima folders berupa array JSON (multipart: string JSON);
folder tunggal lama tetap didukung. Manifest folder dapat berupa string atau array.

### Database besar

Restore database memakai Multer disk streaming khusus, terpisah dari configuredUpload.
Dump tidak dibatasi 500 MiB/importMb. Unduhan dump dikecualikan dari exportMb
di middleware/fileLimits.js. server.requestTimeout=0 memungkinkan upload lama.
JSON lama masih dibatasi 500 MiB karena JSON.parse; gunakan .dump untuk database besar.
Lihat database-backup.md untuk ruang temporary Docker dan reverse proxy.

### Split database dump

backupService.createBackup({partSizeMb:500}) membagi dump yang melewati ambang
melalui databaseBackupParts.js. API POST /api/backups menerima partSizeMb integer
1?10240 MiB. Manifest + bagian memiliki UUID batch serta checksum SHA-256.
POST /api/backups/restore-batch menerima array multipart backups. Validasi dan
penggabungan selesai sebelum restoreBackup mengunci autentikasi/mengubah database.
Route restore lama tetap ada. splitDump memerlukan dump lengkap pada disk terlebih
dahulu; dokumentasikan kebutuhan ruang ganda dan batas total request proxy.
Test: npm run test:database-backup-large.

### Pilihan restore bertahap

Form Database Backup dan File Backup mengakumulasi pilihan file lintas dialog.
File dengan nama sama menggantikan pilihan sebelumnya; tombol per item menghapus
satu file dan Kosongkan pilihan mereset daftar. File Backup memeriksa ulang folder
manifest ketika daftar berubah; nomor inspeksi mencegah respons lama menimpa
pilihan terbaru. Daftar pilihan dikunci selama operasi melalui input.disabled.

## Administrator instalasi baru

Instalasi baru otomatis membuat administrator **`admin`** dengan password **`admin`** saat tabel akun kosong, termasuk mode production. Akun dan password lama tetap dipertahankan. Setelah login pertama, ubah password melalui Account Management. `admin:create` tetap tersedia untuk administrator tambahan.
Seed berada di `database/users.sql`, dipakai oleh db:setup dan startup Node/Docker. Pemeriksaan tabel kosong dikunci untuk mencegah seed bersamaan. Password disimpan sebagai bcrypt; kebijakan password baru tetap berlaku.

Verifikasi perubahan: `node --test test/defaultAccountSeed.test.js test/createAdmin.test.js test/dockerDataInitialization.test.js test/sessionCookieConfig.test.js` lulus (9 test). Test seed memakai cluster PostgreSQL sementara tanpa membaca .env; memeriksa login bcrypt admin/admin, pengulangan seed, password yang sudah diganti, serta akun lama dengan username lain. Deployment Docker belum diuji langsung. Gunakan `PERF_PG_BIN` untuk lokasi binary PostgreSQL nondefault saat menjalankan test seed.
`npm run build` berhasil; Vite memberi peringatan script legacy, font yang diselesaikan saat runtime, dan ukuran chunk besar.
