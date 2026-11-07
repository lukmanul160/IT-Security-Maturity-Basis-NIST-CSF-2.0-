# Panduan belajar dan melanjutkan proyek

## Arsitektur

Peta folder, kontrak fungsi, dan tahapan refactor: [CODE_STRUCTURE.md](CODE_STRUCTURE.md).


NIST Basis menggunakan Express 5/CommonJS, PostgreSQL, Vue 3, Vite dan Tailwind.
Mulai dari package.json ? src/server.js ? src/app.js ? src/routes/index.js.
Logika domain ada di src/services/; konfigurasi database/environment di src/config/.
Schema dasar ada di database/; banyak service juga menjalankan inisialisasi saat startup.

Frontend: frontend/client/src/workspace/components/ adalah sumber tampilan.
Komponen v-pre memakai event dari workspace/features/ yang dirangkai runtime.js.
Periksa features/shared/ untuk startup, permission dan binding. Build menghasilkan
frontend/public/vue/ dan aset pendukung; jangan mengubah hasil build langsung.

## Menjalankan dengan Node.js

Gunakan Node.js 26.13.0 LTS, npm dan PostgreSQL (17 untuk kesesuaian default Docker).
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

## Penataan kode tahap 1 (7 November 2026)

Peta folder dan standar fungsi/UI ada di `CODE_STRUCTURE.md`, dengan README lokal
untuk backend, frontend dan fitur TPRM. Panduan workflow TPRM dipisah menjadi
perhitungan murni, adapter HTML, dan pengendali lifecycle. Komentar menjelaskan
kontrak snapshot, input/output, otorisasi, fingerprint, serta transaksi.
Shortcut panduan memakai `data-tw-navigate`, terpisah dari status tab aktif.
Runtime dan fixture browser diperbarui bersama; endpoint dan schema dipertahankan.

Verifikasi: 35 tes TPRM lulus, fixture Chrome TPRM lulus (tab, shortcut, aktor,
read-only, payload dan field kontrak), serta `npm run build` berhasil. Vite masih
memberi peringatan script legacy, font runtime dan ukuran chunk. Fixture browser
ini bukan audit visual semua halaman atau uji data vendor produksi. Tahap berikut
pada CODE_STRUCTURE belum diterapkan; jangan menyatakan seluruh proyek selesai
refactor atau seluruh UI sudah diaudit.

Regresi luas `npm test` dicoba tetapi tidak selesai: tes database mutation guard
mengalami timeout koneksi PostgreSQL; proses dihentikan setelah hasil tersebut.
Jangan melaporkan suite aplikasi penuh lulus. Untuk mengulang, siapkan lingkungan
test PostgreSQL terisolasi sesuai kebutuhan suite; jangan memakai data operasional.

## Standarisasi seluruh kelompok modul (7 November 2026)

Kelanjutan tahap pertama mencakup 288 file JS/MJS/Vue sumber dan 63 fragmen runtime.
Setiap folder fitur memiliki README lokal, lapisan backend memiliki panduan,
dan katalog AST memuat fungsi, parameter, baris, komentar yang tersedia, serta
dependency statis. `npm run docs:source` memperbarui katalog; `check:structure`
memeriksa cakupan runtime, syntax, tipe tombol Vue dan freshness katalog.
CI security kini memasukkan gate tersebut; workflow CI belum dijalankan di GitHub.

Import `part01`–`part22` diganti nama deskriptif tanpa mengubah urutan sumber.
TPRM dipisah menjadi guidance, adapter HTML, view, form payload, dan lifecycle API.
Sebanyak 145 tombol Vue diberi tipe eksplisit: submit form tetap submit,
toolbar/navigasi menggunakan button. ID DOM dan kelas tampilan dipertahankan.
Komentar di sumber menjelaskan lapisan, invariant, dan batas fungsi utama.
Ini bukan konversi semua classic-script menjadi ES module atau audit visual
seluruh viewport. Shared lexical scope masih merupakan batas arsitektur yang ada.

Runner `npm run test:isolated` membuat PostgreSQL baru dan direktori fixture per
worker, menonaktifkan dotenv sebelum modul aplikasi dimuat, dan memakai SQL schema
repository. Tidak ada restore/database operasional atau scheduler produksi.
Binary PostgreSQL harus tersedia; gunakan PERF_PG_BIN bila bukan lokasi default.
Daftar test berasal dari npm test. Untuk subset:
`npm run test:isolated -- test/fileService.test.js test/fileReferenceDeletion.test.js`.

Hasil awal runner: 401 lulus, 2 gagal karena schema fixture belum lengkap, 5 skip.
Runner kemudian diperbaiki agar menyiapkan database/schema.sql sebelum test.
Percobaan ulang sempat timeout saat initdb dan fixture Chrome gagal tersambung
pada host yang sedang lambat. Hasil akhir dicatat setelah pemeriksaan selesai;
jangan menganggap percobaan tersebut sebagai kelulusan seluruh suite.

Hasil akhir pemeriksaan perubahan ini:

- Katalog mencakup 288 file JS/MJS/Vue aplikasi, termasuk sumber langsung surat
  pernyataan dan virtual office; salinan vendor/build tidak disunting.
- 17 tes struktur, guidance dan kontrak payload TPRM lulus tanpa database/browser.
- Build terbaru berhasil; peringatan legacy script/font runtime/chunk besar tetap ada.
- Source/UI contracts memvalidasi urutan/cakupan 63 fragmen, syntax gabungan,
  tipe tombol Vue dan panduan fitur. Check katalog menjaga nomor baris tetap aktual.
- Regresi penuh awal: 401 lulus, 2 kegagalan schema fixture, 5 skip. Schema runner
  diperbaiki, tetapi verifikasi ulang PostgreSQL tertahan timeout initdb. Jangan
  menyatakan kedua tes tersebut sudah lulus atau suite penuh sudah hijau.
- Chrome fixture ulang gagal tersambung ke debug endpoint sebelum kode UI berjalan.
  Uji visual/browser terbaru belum terverifikasi; build dan unit test bukan penggantinya.
- Lingkungan lokal Node 24.19.0; engine package.json meminta >=26.13.0 <27.
  Tidak ada pengujian Docker/cloud atau perubahan data operasional dalam refactor ini.

Regresi luas dicoba lagi setelah schema tersedia. Beberapa tes integrasi tetap
mengalami `Connection terminated due to connection timeout` pada batas pool 5 detik
(antara lain export asset, audit retention dan compliance). Suite ini tidak boleh
dilaporkan lulus. Pool di preload pengujian kini diberi timeout 30 detik khusus
fixture; pengaturan production tetap 5 detik. Suite penuh dengan timeout baru
belum diverifikasi dari awal hingga akhir. Pengujian luas dihentikan setelah
gangguan koneksi berulang; runner induk membersihkan PostgreSQL sementaranya.
Hasil final yang sah untuk perubahan sumber tetap: build berhasil, kontrak
struktur/katalog 288 file valid, dan 17 tes struktur/guidance/payload lulus.

Uji tambahan LF/CRLF menemukan penggabungan baris pada ekstraksi komentar.
Normalisasi diperbaiki dan kasus tersebut lulus saat diulang. Katalog kemudian
diregenerasi; pemeriksaan akhir 288 file / 63 fragmen kembali lulus. Penutupan
suite luas dan pembersihan fixture sudah selesai; log sementara tidak disertakan.


## Lanjutan standardisasi: manifest dan pemisahan Risk/Gap

- `runtime-parts.json` menjadi satu sumber urutan untuk Vite dan fixture Node. `runtime-source.js` merangkai sumber tanpa separator; validator menolak path di luar sumber, duplikasi dan sumber hilang.
- Risk Management dipisah menjadi workflow-model/view/controller; Gap menjadi gap-model/view/controller. Shared lexical scope, endpoint, payload, ID DOM, serta urutan listener dipertahankan. Model risk masih membaca identitas/izin runtime dan tanggal; ini belum merupakan migrasi ES module terisolasi.
- Sebelum menulis pemisahan, AST gabungan lama dan baru dibandingkan dengan normalisasi posisi/komentar serta urutan deklarasi fungsi hoisted. Seluruh body fungsi dan urutan statement executable identik. Signature SHA-256: `a1b7cc68cf89040011c9d08b5e5fc988c685ce39c5b42b918c9bcf47dedb5715`.
- Katalog diperbarui: 293 file JS/MJS/Vue sumber, 67 fragment runtime. Panduan modul dan struktur mengikuti pemilik fungsi yang baru.
- Verifikasi aktual: 36 test terarah (manifest, Risk, Gap, struktur, guidance/form TPRM) lulus; `check-structure --catalog` lulus; `npm run build` lulus. Build masih memberi peringatan script statis non-module, font yang diselesaikan saat runtime, dan ukuran chunk; tidak diklaim semua aset/font diperiksa visual.
- Chrome fixture Risk lulus: alasan wajib, status pending/sukses, draft dan penolakan API terlihat. Chrome fixture TPRM lulus: tab, assignment payload, read-only, aktor, dependency, acceptance dan field kontrak. Keduanya memakai transport/fixture terisolasi tanpa database operasional. Browser Gap berbasis aplikasi tidak dijalankan ulang karena memakai konfigurasi database aplikasi; fixture unit Gap lulus.
- Hasil browser terbaru menggantikan keterbatasan startup Chrome sebelumnya untuk dua fixture tersebut saja. Regresi PostgreSQL penuh sebelumnya masih belum hijau akibat timeout; tidak diulang pada pemisahan mekanis ini. Docker/cloud, produksi, seluruh viewport, dan seluruh alur modul belum diverifikasi langsung.

## Perbaikan referensi Risk Acceptance dari log pengguna

Log menunjukkan form acceptance tidak ditemukan saat submit (HTTP 400), terpisah dari timeout PostgreSQL pada scheduler. Referensi form baru/berubah kini diperiksa keberadaannya saat save; draft unsigned tetap diizinkan, submit tetap memeriksa pengesahan. Error menyebut RAF dan langkah pemulihan; input diberi petunjuk ID tersimpan. Tiga test transaksi fixture tanpa database menguji rollback form hilang, draft unsigned, dan tanpa referensi; bersama aturan/guidance total 18 test lulus. Penyebab timeout koneksi operasional belum dipastikan; timeout/pool produksi tidak diubah dan database operasional tidak diakses.

## Reminder email: retry bersama dan transport nyata terisolasi

Empat scheduler (Policy, Audit Finding, Asset Renewal, Compliance) menggunakan `reminderScheduler.js`: startup langsung, interval normal satu jam, retry kegagalan tingkat pemeriksaan lima menit, tanpa overlap. Log kegagalan memakai kategori tetap tanpa mencetak kredensial/error mentah. Riwayat pengiriman dan advisory lock per modul tetap dipertahankan. Kegagalan per penerima tetap dicoba pada polling normal berikutnya.

Suite SMTP/reminder pada cluster PostgreSQL temporer: 39 test, 38 lulus, 1 skip (migrasi SMTP legacy opt-in). Mencakup penerima aktual fixture database, akun SMTP, jadwal, deduplikasi, retry delivery, template dan read-only. Test tambahan mengirim melalui Nodemailer ke SMTP TCP lokal dan memeriksa penolakan penerima; bukan hanya mock sendMail. Test scheduler membuktikan retry lima menit, overlap guard, kembali ke interval satu jam, dan redaksi kredensial. Command `npm run test:reminder` tersedia; kini juga mencakup regresi Compliance.

Build frontend perubahan petunjuk acceptance berhasil; struktur/katalog terbaru 294 file/67 fragment lulus. Tidak mengakses konfigurasi SMTP operasional atau mengirim ke internet; penerimaan inbox/provider belum diklaim. Timeout PostgreSQL operasional pada log pengguna masih perlu diagnosis lingkungan; perubahan ini mengatur retry dan pesan kegagalan, bukan klaim memperbaiki server database yang tidak tersedia. Restart backend diperlukan untuk scheduler/validasi baru.

Regresi Compliance terisolasi juga selesai: 5/5 lulus, termasuk PostgreSQL CRUD, reminder terdeduplikasi, retry dan cleanup. Total pemeriksaan reminder dua eksekusi: 43 lulus, 1 skip; tidak ada gagal.
