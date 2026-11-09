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

## Compliance Security Checklist (9 November 2026)

Menu baru di sidebar Compliance memiliki tiga tab: Dashboard, Assignment Checklist,
dan Buat Checklist. Tujuh kolom bawaan dapat dikustomisasi label/tipe/opsi/urutan/
fase definisi-asesmen, ditambah atau dihapus. Satu assessor akun per checklist,
termasuk diri sendiri; PIC / Target tetap teks bebas per item. Dashboard menghitung
item mulai diisi, bukan menyatakan kepatuhan selesai. Evidence berupa teks/referensi,
belum upload berkas; assignment tidak mengirim email otomatis.

Backend Express/PostgreSQL baru: securityChecklistRoutes dan securityChecklistService.
Tabel compliance_security_checklists dibuat saat startup/akses pertama. Permission
compliance-security-checklist mengikuti default Audit Finding, ditambah batas record:
definisi/hapus oleh pembuat/admin, hasil oleh pembuat/admin atau assessor aktif.
Versi dan row lock menolak stale writes, perubahan assignment mencabut akses assessor
lama. API PATCH menerima kolom hasil saja. Frontend Vue memakai jembatan navigasi
security-checklist-open; pemulihan halaman menunggu workspaceUserReady.

Tab Buat Checklist menyediakan template, impor dan ekspor .xlsx melalui
services/securityChecklistWorkbook.mjs. Ekspor menyertakan draft dan metadata kolom
tersembunyi. Impor mengganti tabel draft setelah validasi, tanpa menyimpan otomatis
atau mengambil assignment dari file. Batas: 5 MB, 30 kolom, 500 baris, 4000 karakter
per sel; formula ditolak. Tabel biasa tanpa metadata memakai header baris pertama;
label bawaan dikenali, label tambahan menjadi kolom teks. Detail di
compliance-office-design.md, termasuk perilaku perubahan opsi dan hasil lama.

Verifikasi aktual:
- npm run test:security-checklist: 9/9 lulus, termasuk CRUD/otorisasi HTTP nyata
  serta konflik versi pada PostgreSQL sementara, dan round-trip Excel/validasi.
- npm run test:security-checklist-browser: Chrome lulus untuk tiga tab, dashboard,
  assignment, kolom kustom, unduhan/impor file Excel, pembatasan payload assessor,
  serta draft tetap ada saat konflik. API browser memakai fixture, bukan backend live.
- Regresi compliance, roleActionPermissions, userModuleAccess pada runner terisolasi:
  11 lulus, 1 skip; tidak ada gagal. Tes persistensi aksi opt-in tetap skip.
- npm run test:structure: 11/11 lulus; check:structure lulus untuk 298 sumber dan
  67 fragmen; katalog diregenerasi. npm run build lulus setelah penambahan Excel.
- Peringatan build script legacy, font runtime dan chunk besar tetap ada.
  Node lokal 24.19.0; engine package masih meminta >=26.13.0 <27.

Tidak membaca .env atau memakai data operasional. Suite penuh, sesi/login browser
end-to-end, semua viewport, serta deployment Docker/cloud belum diuji pada fitur ini.
Restart backend diperlukan untuk endpoint/permission baru; frontend sudah dibangun.

## Checklist: modal, English, evidence dan template reusable (9 November 2026)

Bagian ini menggantikan alur assignment langsung pada catatan checklist sebelumnya.
Tab Buat Checklist kini hanya membuat template tanpa assessor. Tab Assignment
Checklist memiliki modal Tambah assignment: pilih template, isi judul aplikasi/
asesmen dan assessor (termasuk diri sendiri). Satu template dapat dipakai berkali-kali;
setiap assignment menyimpan snapshot struktur, hasil dan evidence sendiri. Perubahan
atau penghapusan template tidak menimpa/menghapus assignment lama. Ubah assignment
mengubah judul/assessor melalui modal terpisah; struktur snapshot tidak dapat diubah.

Migrasi idempotent menambah kind, template_id dan template_title pada
compliance_security_checklists. Data sebelum pemisahan tetap assignment lama,
tidak dibagikan sebagai template. Template dapat dibaca semua pengguna berizin
modul; ubah/hapus hanya pembuat/admin. Assignment hanya untuk pembuat assignment,
assessor aktif/admin. Pembuat template tidak otomatis melihat assignment orang lain.
Endpoint baru POST /assignments dan PATCH /:id/assignment-info, relatif ke
/api/compliance/security-checklists. POST akar selalu membuat template dan
mengabaikan assessor/kind yang dikirim pengguna. Tes HTTP membuktikan alur ini.

Semua penambahan/perubahan memakai modal native showModal dengan focus trap,
konfirmasi draft pada Tutup/Escape dan larangan tutup selama request. Modal menampilkan
pesan/error dan mempertahankan draft saat konflik. Bahasa Indonesia/English tersedia
melalui NistI18n reaktif, termasuk saat modal terbuka. Konten/kolom/opsi kustom/nama
file dipertahankan; opsi Status bawaan diterjemahkan pada tampilan tanpa mengubah
nilai tersimpan. Modul ditandai data-no-translate dan menerjemahkan UI secara eksplisit
agar observer global tidak mengubah data Vue/pengguna.

Evidence mendukung teks dan file per item, tipe evidence pada kolom kustom.
Maksimum 10 file per record, masing-masing 10 MB: PDF, Word, Excel, PowerPoint dan
gambar yang didukung. Pending file dikirim multipart saat simpan; JSON hasil dan
BYTEA file tersimpan dalam transaksi yang sama. Tabel compliance_security_checklist_files
memakai ON DELETE CASCADE. Edit teks mempertahankan file, hapus item/kolom/file
membersihkan lampiran saat simpan. Akses unduhan memeriksa permission dan record.
File definisi template disalin terpisah saat assignment dibuat; file hasil hanya
diisi pada assignment. Excel template tetap tersedia, tanpa lampiran biner.

Verifikasi terbaru: 10/10 tes fitur/Excel lulus di PostgreSQL sementara, termasuk
multipart/unduhan HTTP, rollback, stale writes, isolasi dua aplikasi, perubahan
assessor, reuse/penghapusan template dan endpoint assignment. Chrome fixture lulus
untuk modal, discard dibatalkan, dua assignment satu template, hasil terpisah,
bahasa, evidence upload dan unduhan/impor Excel. 11/11 tes i18n dan 11/11 struktur
lulus; katalog mencakup 298 sumber / 67 fragmen dan diregenerasi setelah perubahan.
Build frontend terakhir berhasil setelah perubahan template/assignment dan bahasa.
Peringatan legacy script/font runtime/chunk besar tetap relevan. Tidak membaca .env,
tidak mengubah data operasional, dan tidak menguji Docker/cloud atau sesi/login
browser terhadap backend live. Restart backend diperlukan setelah update.

## Checklist: tabel memenuhi panel (9 November 2026)

Empty-state template/assignment memakai colspan 4/6 sesuai jumlah header.
Daftar dan grid memakai width 100%, table-layout fixed dan wrap teks lokal;
resize global dikecualikan agar lebar piksel tersimpan tidak menyisakan ruang.
Grid editor memakai minimum 140 piksel per kolom dan scroll lokal bila perlu.
Chrome fixture dengan stylesheet komponen lulus ukuran tabel daftar di 1280/390
piksel dan tanpa overflow halaman, sambil mempertahankan uji alur yang sudah ada.
check:structure/katalog lulus. Sandbox awal menolak esbuild/Chrome; keduanya
kemudian dijalankan dengan eskalasi otomatis yang disetujui. Tidak memakai data
operasional atau menguji Docker/cloud.

## Checklist: jarak modal dan dropdown pencarian (9 November 2026)

Modal assignment memakai fieldset grid satu kolom, label/input terpisah, padding
28/20 piksel dan gap 20 piksel. ChecklistSearchSelect.vue mengganti select template
serta assessor dengan combobox pencarian berdasarkan label/nama/username, pilihan
klik/panah/Enter, Escape untuk tutup daftar, pesan kosong bilingual dan native
custom validity. Input bebas tidak menjadi ID; mengetik membatalkan pilihan lama.
Data/nilai akun tidak diterjemahkan. Browser fixture menguji padding, layout grid,
pencarian kedua field, hasil kosong dan Enter, serta payload/reuse/evidence/Excel.
Uji memakai komponen Vue dengan API fixture, tanpa data operasional.

Verifikasi akhir perubahan dropdown: build berhasil, Chrome fixture lulus, 22 tes
struktur/i18n lulus, check:structure lulus untuk 299 sumber/67 fragmen. Build dan
worker tes dijalankan setelah eskalasi otomatis karena spawn EPERM di sandbox.

## Technology Asset (9 November 2026)

Fitur baru di grup Asset Management memiliki Dashboard, Technology Radar dan
Register Asset. Register aplikasi berisi nama/pemilik/URL/deskripsi serta daftar
teknologi dengan versi/kategori/ring/source/evidence/notes. Many-to-many dinamis:
A/ABCD + B/BCDE berbagi B/C/D; versi yang berbeda menghasilkan simpul terpisah dan
perbandingan antar-aplikasi. Identitas nama+versi+kategori case-insensitive,
versi kosong tetap Unknown. Radar empat kategori/ring memakai keputusan paling
berhati-hati untuk satu teknologi-versi yang berbeda ring antar-aplikasi.
Graph klik/keyboard/zoom/scroll dibatasi 30 aplikasi/60 teknologi per tampilan,
dengan petunjuk pencarian/filter; register tidak dipotong oleh batas graph.

Backend baru: technologyAssetService, technologyHeaderScanService,
technologyVulnerabilityService, technologyAssetRoutes, shared/technologyFingerprint.
Tabel technology_assets dibuat saat startup/akses pertama; tidak mengubah hardware
register. Permission technology-asset terpisah dengan default standar aset.
Simpan/hapus memakai versi optimistik dan menolak stale writes. Semua editor
memakai modal; read-only dan error/draft dipertahankan. UI Indonesia/English,
konten nama/versi pengguna tetap asli.

Scan menggunakan HEAD publik HTTP/HTTPS port 80/443 saja, tanpa autentikasi/cookie/
crawling, maksimal 3 redirect. DNS dan semua redirect dicek ulang; address dipin
pada koneksi untuk mencegah rebinding. Private/loopback/linklocal/mapped/reserved
addresses diblokir; gunakan manual untuk aplikasi internal. Allowlist header
menghasilkan petunjuk stack/proxy/CDN dan versi yang terlihat, bukan jaminan stack
lengkap. Hasil menjadi draft; simpan eksplisit diperlukan. Rate scan 10 detik/user,
maksimal 2 aktif/proses; timeout DNS 3 detik, HTTP 5,5 detik, batas header 16 KiB.

Cari CVE versi ini memakai nama+versi melalui NVD API 2.0 dengan fixed-host HTTPS.
Default kandidat last-modified 119 hari, dapat beralih semua waktu, 20 hasil/halaman.
CVSS/severity/tanggal/status/source dan waktuquery terlihat, tidak mengubah radar.
Pencarian keyword bukan konfirmasi terdampak; wajib cocokkan CPE/rentang versi/
konfigurasi. Nol hasil bukan aman. API memerlukan internet; tidak ada scheduler
notifikasi, API key, pencocokan CPE atau vulnerability scanner aktif. Rate 1 request/
7 detik/proses, cache 5 menit/100 query, timeout 10 detik, respons 4 MB. Hanya nama/versi
dikirim keluar, bukan data aplikasi/URL internal. Detail di technology-asset.md.

Verifikasi: delapan tes Technology Asset lulus pada PostgreSQL sementara; mencakup
HTTP permissions, CRUD/konflik, signature, private URL/redirect/DNS rebinding, HEAD TCP
lokal nyata dengan DNS pinning, model sharing/versi dan kandidat CVE/cache fixture.
Chrome fixture lulus tiga tab, A/ABCD+B/BCDE, version divergence, graph/radar,
scan draft-only/error retention, query versi CVE, viewer, bahasa, viewport 1280/390.
Regresi struktur/sidebar/permission/i18n: 25/25 lulus. Katalog 306 sumber/67 fragmen
lulus dan frontend dibangun ulang. Build mempertahankan peringatan legacy script,
font runtime dan chunksize. Node 24 lokal; engine package tetap meminta 26.

Tes tidak menghubungi website organisasi atau NVD live. Provider internet live,
seluruh login/backend browser end-to-end, seluruh viewport, Docker/cloud dan suite
aplikasi penuh belum diverifikasi. Tidak membaca .env atau data operasional.
Restart backend diperlukan dan Ctrl+F5 untuk frontend. Build/Chrome/test worker
menggunakan eskalasi otomatis disetujui karena batas spawn sandbox.

## Technology Asset: passive website profiling and source remarks

Scanner now supports directly addressed internal/public HTTP(S), custom ports,
pinned DNS, bounded HTML/gzip and up to three same-origin JS/CSS assets. Local
fingerprints read generators, paths, framework markers, version banners and cookie
names without executing scripts or attempting login. Supersedes earlier public-only
HEAD limitation. Metadata/loopback stay blocked; public-to-internal redirects denied.
No Wappalyzer engine/database integration. Internal reachability and trusted TLS CA
are deployment prerequisites. Radar explains all four rings and zero counts in both
languages. Register/editor show source remarks Scan result/Manual input per technology.
Verification: 12 isolated service/PostgreSQL tests and 25 structure/i18n/access tests
passed; Chrome fixture passed mapping, versions, radar, language, draft scan/error
retention, CVE lookup, viewer, responsive layouts. No organization website or live NVD
provider tested. Frontend build passes with existing font/script/chunk warnings.

Follow-up scan error handling: global middleware intentionally redacts 5xx, which
hid expected upstream scan failures as Internal server error. Scan route now handles
only owned ScanError instances with sanitized bilingual 502/504 diagnostics; unknown
exceptions retain generic redaction. Added endpoint regression through real middleware.

Multi-technology scan follow-up: aggregates all matches (not first-match), reads up
to 12 same-origin assets, adds common library URL markers, displays count/list of
scan results. Does not claim complete hidden/backend stack inventory. Fixture checks
nine technologies in one scan including versions discovered in the twelfth asset.

UI follow-up: compact responsive scan cards, bounded local result scrolling,
collapsible technology editor cards. JavaScript script-tag hints exclude JSON-LD;
fixture covers PHP + JavaScript + Bootstrap simultaneously, JS version unknown.


## Technology Asset browser scan mode

Added technologyBrowserScanService with Chrome CDP (no new npm dependencies), fresh
temporary profile, default Chromium sandbox retained, dead proxy/DNS networking,
Fetch interception forwarding only validated pinned GET document/scripts/styles.
Runtime allowlist extracts rendered Angular/Zone/lit/etc and merges explicit versions.
UI has separate bilingual browser scan button; standard mode remains available.
Browser resources are bounded and may yield partial results when blocked. Requires
Chrome/Chromium installed or CHROME_PATH; deployment Docker/cloud not verified.
Real Chrome injected-response tests pass including dynamic Angular 15.2.9, lit-html
3.3.3, lit-element 4.2.2 and blocked POST/metadata requests. See module doc for limits.

Live read-only browser check on www.brins.co.id (2026-11-09) returned HTTP200,
11 technology hints, 9 assets, partial with16 blocked requests. lit-html3.3.3 and
lit-element4.2.2 verified; Angular15.2.9 from user screenshot not reproduced.
CDP navigation timeout raised to10sec (transport remains5.5sec); CDP timeouts now
return sanitized bilingual504 rather than generic500. Standard tests14/14, runtime
Chrome fixtures2/2 and structural/i18n/access25/25 passed; UI fixture also checks
browser mode payload and duplicate merging. Build retains existing font/chunk warnings.


## Security review and inventory rule search (2026-11-09)

See security-review-technology-checklist-2026-11-09.md for findings, fixes, test
results and open deployment risks. Browser CDP now bounded by direct ws dependency;
script-driven cross-target navigation denied. Checklist pre-authorizes uploads,
checks file signatures and sandboxes/no-stores downloads. Excel parsing moved to
15sec worker with declared+actual ZIP expansion checks (25MiB/256 entries).
Compatible security patches changed DOMPurify/Multer and transitive lockfile;
registry production audit still has5 moderate archive-related packages requiring a
major update outside these two modules;0 high/critical. Initial sandbox audit was
not reliable and has been superseded. npm install issued existing engine mismatch
warning(Node24.19 vs package>=26.13). No .env/production data used.

Technology UI now has5 tabs: Dashboard, Technology Radar, Register Asset, Technology
Search and Relationship Graph. Numeric dotted version rules support20 criteria with
AND/OR, actual registered values only;PHP6.1.1.1 <7.1.1 is tested. Global graph filter
and canvas search work. KnowledgeGraph is reused with optional explicit edges,
terminology and search-neighbors props; default Knowledge Notes behavior preserved.
Technology graph labels avoid creating/parsing wiki-links from user-entered names.


## Technology browser: broad community rule engine (2026-11-09)

Replaced browser-only small signature coverage with 7,695 local pinned community
Wappalyzer-format rules. New services: technologySignatureService/Worker and
technologyBrowserProbe; source in third_party/webappanalyzer with upstream GPL-3.0,
README, NOTICE, SOURCE hashes retained. Updater script fetches immutable commit,
never runs during scanning. Docker runtime now copies the data, no Docker live test.
Browser collects bounded JS/DOM/meta/script observations, regexes run in terminable
192MiB/6sec worker; network controls remain. Implied/excluded/conditional rules,
versions and categories handled. Details persist via validated detection metadata
and display in expandable cards/editor, with English labels.403+ pages yield only
header hints; no WAF bypass or challenge-stack attribution. BRIFinance returned403
live, so its supplied full screenshot remains unverified. Synthetic rendered page
proves listed12 technologies and stated GA4/Next/styled versions simultaneously.
Tests: rules3/3, Chrome scanner6/6, inventory16/16. See technology-asset.md for caps,
license/source and parity limitations. Prior statement 'no Wappalyzer dataset'
applies to standard scan only, superseded for browser mode by community dataset.

Final resumed verification: technology UI Chrome fixture passed including category
badges, expandable descriptions and HTML-as-text escaping. i18n/source/runtime25/25
passed; source catalogue314 files/67 fragments validated and diff whitespace check
passed. Build completed from Vue source; standard legacy script/font/chunk warnings
remain. An earlier auto-approval usage limit delayed these commands but the resumed
run executed them successfully.


## Scan progress, timeout resilience and table density

POST scan supports opt-in NDJSON live progress with same permission/throttle; normal
JSON callers preserved. UI progress uses genuine service stages,100 only on result,
last value retained on failure. Browser preserves partial header/HTML/asset findings
when navigation/runtime/DOM times out after main response; oversized/closed CDP still
fails safely. Frame Execution was terminated is handled as bounded observation timeout.
Apply filters contrast fixed in light mode. All3 inventory tables paged20; list cells
show5 technologies with See more read-only modal. New services technologyScanProgress,
technologyTablePage and controlled TechnologyTablePager component. Browser fixture
covers stream20->100, light button computed colors,25 records20/5, seven technologies
5preview/7modal, and comparison paging. Version/CVE/search/graph behavior preserved.

Verification for progress/paging follow-up: inventory+HTTP streaming17/17, Chrome
scanner7/7 including non-terminating runtime fallback, UI Chrome fixture passed
stream20->100/light Apply filters contrast/20-row paging/See more modal, and
i18n/runtime/source26/26. Structure catalogue317 files/67 fragments and whitespace
check passed. No organization-site or production data used for these tests.
