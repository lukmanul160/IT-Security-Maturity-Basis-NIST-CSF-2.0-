# Compliance dan Office Design

## Penggunaan

Sidebar **Compliance** memiliki tiga halaman:

- **Reporting Regulator**: tambah/ubah/hapus pelaporan, tujuan regulator/induk
  perusahaan/perusahaan lain, PIC, tenggat, status, catatan, dan reminder email.
  Filter tersedia untuk status, lewat tenggat, dan pencarian teks. Tab Pengaturan
  SMTP memungkinkan admin memilih, menambah, mengubah koneksi, dan mengirim email
  percobaan melalui API SMTP terpusat yang sama dengan pengaturan akun.
- **Narahubung**: daftar instansi/layanan, kategori, nama kontak, telepon, email,
  dan catatan (misalnya wilayah atau jam layanan). Data awal kosong; isi nomor
  layanan yang sesuai lokasi perusahaan.

**Office Design** berada tepat di bawah **Asset Dashboard**. Buat denah kosong
atau gunakan contoh kantor yang seluruh objeknya dapat diedit. Klik objek di
palet untuk menambah, geser pada kanvas, lalu atur ukuran, label, dan rotasi pada
panel properti. Tersedia duplikat, urutan lapisan, hapus, undo/redo, snap grid,
zoom, simpan beberapa denah, dan ekspor SVG. Tombol Delete/Backspace menghapus
objek yang dipilih saat kanvas memiliki fokus. SVG tidak memuat grid editor.

## Reminder

Reminder dikirim kepada email PIC/tim yang diisi pada masing-masing pelaporan,
melalui akun SMTP terpusat. Reminder harus diaktifkan pada form; default nonaktif.
Scheduler memeriksa saat server mulai dan setiap satu jam. Kalender menggunakan
UTC+7. Pengiriman hanya dari H-N hingga tanggal tenggat, untuk status yang belum
selesai. Tanpa pengulangan, satu email dikirim dalam rentang itu; jika aktif,
pengulangan satu kali per hari. Jadwal terlewat dikirim sekali ketika pemeriksaan
berikutnya masih berada dalam rentang. Secara default tidak ada pengiriman
setelah tenggat. Opsi **Terus ulangi setiap hari setelah tenggat** mengaktifkan
pengulangan harian tanpa batas jumlah pengiriman, termasuk setelah tenggat,
sampai status Sudah dilaporkan atau reminder dinonaktifkan. Data lama tetap
menggunakan perilaku sebelumnya sampai opsi ini dipilih.

Riwayat pengiriman disimpan per laporan, tenggat, email, dan tanggal reminder.
Mengubah tenggat atau email membuat kombinasi jadwal baru. Kegagalan SMTP tidak
dicatat sebagai keberhasilan dan dicoba lagi pada pemeriksaan berikutnya.
Advisory lock mencegah dua scheduler memproses batch bersamaan. Seperti pengirim
SMTP lain, kegagalan proses setelah SMTP menerima pesan tetapi sebelum riwayat
tersimpan masih dapat menghasilkan pengiriman ulang.

## Izin dan penyimpanan

Modul memakai permission `reporting-regulator`, `narahubung`, dan `office-design`.
Default: semua role membaca; admin/approver/editor/user menambah dan mengubah;
admin/approver menghapus. Administrator dapat mengatur matriks aksi yang ada.
API memeriksa izin terlepas dari kontrol UI.

Startup `src/server.js` membuat tabel yang belum tersedia melalui `ensureStore`;
restart backend setelah memasang perubahan. Data tidak bergantung pada browser.
Office Design memakai versi untuk menolak penyimpanan/penghapusan dari salinan
lama (HTTP 409). Ukuran layout adalah satuan kanvas, bukan pengukuran bangunan
atau CAD. Batas 500 objek, kanvas 200–4000 per sisi. Undo/redo disimpan selama
sesi editor dan direset setelah menyimpan atau memuat denah lain.

## Peta kode

- `database/compliance.sql`: tabel laporan, narahubung, dan riwayat reminder.
- `src/services/complianceService.js`: validasi dan CRUD.
- `src/services/complianceReminderService.js`: kalender, pesan, dan scheduler.
- `src/services/officeDesignService.js`: validasi denah dan kontrol versi.
- `src/routes/complianceRoutes.js`, `src/routes/officeDesignRoutes.js`: HTTP dan izin.
- `frontend/client/src/workspace/components/ComplianceView.vue`, `OfficeDesignView.vue`: markup.
- `frontend/client/src/workspace/features/compliance/register.js`: state dan event CRUD.
- `frontend/client/src/workspace/features/compliance/smtp-settings.js`: tab dan form SMTP admin.
- `frontend/client/src/workspace/features/office-design/shapes.js`: objek SVG dan contoh denah.
- `frontend/client/src/workspace/features/office-design/editor.js`: state editor, interaksi, API, dan ekspor.
- `frontend/client/src/styles/office-design.css`: layout responsif dan tema.

Validasi: `npm test`, `npm run build:client`, dan
`npm run test:compliance-office-browser`. Browser regression memerlukan Chrome,
PostgreSQL terkonfigurasi, dan akun admin. Script menjalankan backend sementara,
membuat fixture bernama unik, serta membersihkan fixture saat selesai; tidak
mengirim email. Tes database memakai tabel sementara dan SMTP mock.

## Pengaturan reminder terpusat dan pagination

Tab Pengaturan SMTP pada Reporting Regulator kini memuat jadwal hari/bulan,
interval pengulangan, batas jumlah atau tanpa batas, pengulangan setelah tenggat,
mode PIC / daftar bersama, pemetaan PIC, template subjek/isi, dan pratinjau.
Pada form pelaporan pilih Gunakan pengaturan reminder tab SMTP untuk mengikuti
pengaturan ini. Default pelaporan baru memakai pilihan itu; data lama tetap
memakai pengaturan per laporan sampai pilihannya diaktifkan. Menonaktifkan
reminder terpusat menghentikan semua laporan yang memakai pengaturan terpusat.
Pelaporan dengan pengaturan khusus tetap mengikuti jadwalnya sendiri.

Pemetaan email menampilkan delapan baris per halaman, disertai pencarian dan
navigasi Sebelumnya/Berikutnya. Ini berlaku di Audit Finding, Policy Register,
dan Reporting Regulator. Form menyimpan seluruh pemetaan, termasuk halaman
lain; Hapus pemetaan hanya menghapus baris terpilih, bukan kontak di register.

## Deploy Docker

Dockerfile membangun frontend dari source, menyalin backend dan database,
lalu menjalankan scripts/docker-start.js. Saat startup, ensureStore membuat
tabel compliance_reminder_settings secara idempotent; pengaturan dan riwayat
reminder tersimpan dalam volume PostgreSQL. Kunci enkripsi SMTP tetap berada
pada volume app_data. Scheduler berjalan dalam proses backend container.

Siapkan .env.docker mengikuti docker.env.example, lalu jalankan:

```sh
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 app
```

Perubahan frontend di-build ulang di image; restart saja tidak mengganti image.
Gunakan kembali project/volume Compose yang sama untuk mempertahankan data.
Pengujian konfigurasi: npm run test:docker-config. Pengujian build dan startup
container sesungguhnya memerlukan Docker Engine; mesin pengembangan pada
sesi ini tidak menyediakan Docker.

## Bukti pelaporan dan pemulihan pengaturan

Setelah memilih status Sudah dilaporkan, unggah bukti pada form pelaporan.
Maksimum sepuluh file per laporan, sepuluh MB per file; mendukung PDF, Word,
PowerPoint, PNG/JPG/GIF/WebP. File disimpan di compliance_report_files sebagai
BYTEA dengan foreign key ke laporan. Penyimpanan data laporan dan unggahan
bersifat atomik. Edit tanpa unggahan mempertahankan file lama. Pembaca modul
boleh mengunduh bukti; hapus bukti mengikuti izin delete modul. Menghapus laporan
juga menghapus buktinya. Volume PostgreSQL dan backup database mencakup file ini.

Jika pengaturan reminder gagal dimuat, pesan terlihat di bagian atas panel dan
tersedia tombol Coba muat pengaturan lagi. Form terkunci sampai server
mengembalikan pengaturan tersimpan, agar data tidak tertimpa nilai awal.
Untuk error API belum tersedia, rebuild/restart backend image Docker yang sama
dengan versi frontend. Tabel pengaturan juga disiapkan secara idempotent ketika
dibaca melalui entry point yang tidak menjalankan server.js.

## Hubungan daftar pelaporan dengan SMTP

Kolom Reminder kini menampilkan status efektif, akun SMTP, jadwal, mode bersama
atau khusus, dan email penerima yang dipakai scheduler. Perubahan pada pengaturan
bersama tercermin saat daftar dimuat ulang tanpa perlu mengedit setiap laporan.
Banner di Daftar pelaporan menampilkan koneksi/jadwal bersama dan tautan langsung
ke tab pengaturan (admin). Menyimpan reminder memperbarui daftar secara otomatis.

Form pelaporan memilih PIC melalui register penerima SMTP yang sama. Dalam mode
bersama, email diambil dari register/pemetaan; email penerima pengganti opsional
hanya dipakai bila ingin mengutamakan alamat lain. Pengaturan jadwal/akun khusus
ditampilkan hanya jika opsi Ikuti pengaturan SMTP / reminder bersama dimatikan.
Menyimpan koneksi SMTP memilih akun itu pada form reminder, tetapi tetap memerlukan
Simpan reminder untuk menerapkan perubahan ke laporan; pengiriman tidak diaktifkan
hanya karena sebuah koneksi baru disimpan. Data dengan mode khusus tetap memakai
konfigurasinya sendiri sampai mode bersama dipilih.


## Kanvas baru dan interaksi editor

Tombol Kanvas baru menyimpan perubahan denah aktif terlebih dahulu. Bila simpan
tertolak (termasuk konflik versi), denah lama beserta perubahan tetap terbuka.
Kanvas baru kosong dapat disimpan; denah sebelumnya tetap dapat dipilih melalui
Kanvas tersimpan. Nama dan ukuran diatur lewat Nama & ukuran.

Office Design menyediakan CCTV, kontrol akses, alarm, APAR, detektor asap,
pintu darurat, dan titik kumpul. Panel CCTV mengatur jarak 0.1?100 meter,
sudut 10?180 derajat, visibilitas, serta arah melalui rotasi 0-359 derajat.
Nama & ukuran menyediakan skala satuan per meter (default 100). Area CCTV
merupakan overlay geometris untuk perencanaan, tidak menghitung penghalang,
spesifikasi lensa, tinggi pemasangan, maupun kemampuan identifikasi kamera.
Overlay ikut tersimpan dan diekspor SVG.

Office Design, Pemodelan Register Aset, dan Pemodelan Ancaman memakai shortcut:
Ctrl/Cmd+Z (undo), Ctrl+Y atau Ctrl/Cmd+Shift+Z (redo), Ctrl/Cmd+S (simpan),
Delete/Backspace (hapus dari kanvas), panah (geser 1), dan Shift+panah (geser 10).
Shortcut kanvas tidak mengambil alih input/textarea/contenteditable atau modal.
Pilih objek lalu tarik pegangan biru di sudut kanan bawah untuk resize.
Undo/redo disimpan selama sesi editor; pindah/muat ulang kanvas mereset riwayat.
Office dan Threat mendukung Ctrl/Cmd+D serta salin/tempel internal Ctrl/Cmd+C/V.
Diagram aset mempertahankan satu node per aset: Delete hanya menyembunyikan node
di kanvas, bukan menghapus record aset atau relasi. Tambahkan lagi dari katalog
untuk mengembalikannya. Ukuran node disimpan bersama posisi dan garis mengikuti
batas node yang diubah. Riwayat diagram tidak membatalkan mutasi relasi pada API.

Validasi tambahan: `npm run test:canvas-editors-browser` memakai editor hasil
build dan fixture API browser tanpa menulis diagram milik pengguna; tes backend
Office dan Asset Diagram memeriksa validasi serta penyimpanan data.

### Rotasi menggunakan kursor

Pilih objek, lalu tarik pegangan lingkaran di atasnya untuk memutar terhadap
pusat objek. Rotasi mengikuti kursor dalam derajat bulat (0-359); tahan Shift
untuk kelipatan 15 derajat. Snap grid hanya mengatur posisi/ukuran. Satu tarikan dapat
dibatalkan dengan satu Undo dan dipulihkan dengan Redo. Sudut pada panel properti
diperbarui langsung, ikut disimpan, dan digunakan pada ekspor SVG serta area CCTV.
Pegangan putar tersedia bagi pengguna yang memiliki izin mengedit.

Verifikasi menggunakan fixture API browser dan build lokal; tidak menguji
deployment Docker/cloud atau menulis denah operasional.

## Compliance Security Checklist

Menu pada grup Compliance memiliki tiga tab:

1. **Dashboard**: assignment kepada pengguna aktif, template yang dibuat, total
   item assignment yang dapat diakses dan item mulai diasesmen. Minimal satu
   nilai atau file di kolom hasil berarti mulai diisi, bukan bukti kepatuhan selesai.
2. **Assignment Checklist**: **Tambah assignment** membuka modal pilihan template,
   judul asesmen/aplikasi (misalnya Aplikasi 1, Aplikasi 2), dan assessor akun.
   Pilih akun sendiri untuk self-assessment. Satu template dapat dipakai berkali-kali.
   **Buka checklist** membuka modal hasil/status/evidence. **Ubah assignment**
   mengubah judul atau assessor melalui modal tersendiri (pembuat assignment/admin).
3. **Buat Checklist**: buat/kelola template tanpa memilih assessor. Template
   menentukan kolom dan item; kolom hasil kosong/read-only sampai dipakai pada
   assignment. Template dapat dibaca semua pengguna yang memiliki izin baca modul;
   ubah/hapus tetap dibatasi pembuat template/admin dan izin aksi.

Setiap assignment memiliki snapshot template, judul, assessor, hasil dan evidence
sendiri. Perubahan template berlaku bagi assignment baru; assignment lama tetap
memakai struktur semula. Menghapus template tidak menghapus hasil assignment.
Judul template saat assignment dibuat tetap tercatat meskipun sumber dihapus.
Daftar assignment hanya untuk pembuat assignment, assessor aktif, atau admin.
Pembuat template tidak otomatis mendapat akses ke assignment yang dibuat pengguna lain.

Kolom bawaan: ID, Area, How To Produce, Expected Result, Status,
Evidence / temuan, PIC / Target. Kolom dapat ditambah, diganti nama, diurutkan,
dihapus, bertipe teks/pilihan/evidence-file, dan ditentukan sebagai definisi atau
hasil asesmen. Maksimum 30 kolom, 500 baris, 4000 karakter per sel.
PIC / Target merupakan teks per item, terpisah dari assessor assignment.
Satu assessor per assignment, tanpa email notifikasi otomatis.

### Modal dan bahasa

Seluruh penambahan/perubahan berlangsung dalam modal. Modal editor mengunci tab/
daftar di belakangnya dan menahan fokus. Tutup/Escape meminta konfirmasi jika
ada perubahan; batal mempertahankan draft. Modal tidak dapat ditutup selama request.
Simpan berhasil tetap membuka modal editor untuk pemeriksaan. Error/konflik tampil
di modal dan tidak menghilangkan isian. Modal assignment ditutup setelah berhasil.

Pilihan bahasa Indonesia/English mengikuti pemilih bahasa workspace dan berubah
saat modal masih terbuka. Label, tombol, petunjuk, konfirmasi dan pesan utama
memiliki terjemahan. Judul aplikasi/template, nama akun, nama file, label/opsi
kolom kustom dan isi pengguna tidak diterjemahkan atau diubah nilainya. Opsi Status
bawaan diterjemahkan pada tampilan; nilai tersimpan tetap sama.

### Evidence dan file

Kolom bawaan Evidence / temuan bertipe evidence-file, mendukung teks dan lampiran.
Gunakan tipe **Evidence / file** untuk kolom kustom atau kolom lama yang masih
bertipe teks. Dalam assignment, unggah pada item yang sesuai, lalu **Simpan hasil
asesmen**. File yang dipilih masih pending sampai simpan berhasil. Batalkan file
menghapus pilihan lokal; Hapus file baru berlaku saat checklist disimpan.

Maksimum 10 file per template/assignment, masing-masing 10 MB, tidak kosong.
Format: PDF, Word, Excel (.xls/.xlsx), PowerPoint, PNG/JPG/GIF/WebP; backend
memeriksa ekstensi dan MIME sesuai pola upload aplikasi. File tersimpan sebagai
BYTEA di PostgreSQL, termasuk backup database. Simpan hasil dan file atomik;
kegagalan/konflik membatalkan seluruh transaksi. Edit teks mempertahankan file.
Hapus item/kolom, ganti tipe evidence ke teks, atau hapus checklist membersihkan
lampiran terkait saat simpan berhasil. Template hanya menerima file pada kolom
definisi; file definisi disalin ke snapshot assignment baru dengan ID terpisah.

Unduhan memeriksa izin baca modul dan akses record; template dapat dibaca pengguna
modul, assignment hanya pembuat/admin atau assessor aktif. File dikirim sebagai
attachment dengan Cache-Control no-store. Mengganti assessor mencabut akses
assessor lama, kecuali ia pembuat assignment/admin.

### Impor/ekspor Excel

Tab Buat Checklist menyediakan Unduh template Excel dan Impor dari Excel.
Impor membuka modal template; input file dan Ekspor Excel ada di modal editor.
Ekspor memakai isi draft saat ini, termasuk perubahan belum disimpan; bukan simpan.
File `.xlsx` berisi sheet Checklist dan metadata tersembunyi _Checklist yang
mempertahankan ID/label/urutan/tipe/opsi/fase kolom kustom. Lampiran biner tidak
ikut Excel; gunakan backup database untuk file. Assignment tidak dibuat dari Excel
secara otomatis: simpan template lalu buat assignment di tab 2.

Impor maksimum 5 MB, 30 kolom, 500 baris. Baris pertama berisi nama kolom dan
mulai A1. Ekspor ber-metadata memerlukan header yang sesuai. File biasa tanpa
_Checklist mengenali label bawaan; label tambahan menjadi kolom teks. Status
baru ditambahkan ke opsi (maksimum 30). Baris kosong dilewati, formula ditolak
(ganti dengan nilai), ID teks seperti 001 dan evidence multibaris dipertahankan.

Impor mengganti seluruh kolom/baris draft aktif, atau membuat draft template baru.
Draft yang berubah meminta konfirmasi sebelum diganti. Judul aktif dipertahankan;
judul file dipakai bila kosong. Mengimpor ulang pada template lama menandai file
lama untuk dihapus saat simpan karena identitas baris impor baru. Periksa dahulu.

### Izin, database dan verifikasi

Permission `compliance-security-checklist` mengikuti default Audit Finding:
semua role membaca, admin/approver/editor/user membuat/mengubah, admin/approver
memiliki aksi hapus. Semua aksi juga memeriksa pembuat/assessor di server.
Approver tidak dapat menghapus record orang lain hanya karena punya izin hapus.
Struktur assignment baru tidak dapat diubah lewat endpoint template; judul dan
assessor memakai endpoint assignment-info; hasil memakai PATCH assessment.
Versi dan row lock menolak stale writes (409). Salin draft penting sebelum reload.

Tabel compliance_security_checklists menyimpan kind (template/assignment), referensi
sumber dan snapshot. Data sebelum pemisahan dipertahankan sebagai assignment lama;
tidak dikonversi menjadi template yang dibagikan. Tabel file memiliki foreign key
ON DELETE CASCADE ke record. Migrasi idempotent pada startup/akses pertama.
Restart backend setelah update dan bangun ulang frontend dari sumber.

Kode: securityChecklistService.js, securityChecklistRoutes.js,
SecurityChecklistView.vue, services/securityChecklistWorkbook.mjs dan i18n.js.
`npm run test:security-checklist` memakai PostgreSQL sementara, menguji multipart/
unduhan HTTP nyata, akses, rollback, versi, reuse snapshot dan round-trip Excel.
`npm run test:security-checklist-browser` memakai Chrome + transport API fixture:
modal, tiga tab, dua aplikasi dari satu template, bahasa, file evidence, unduhan/
impor Excel dan draft konflik. Fixture bukan sesi/login end-to-end, seluruh
viewport atau deployment Docker/cloud. Data operasional tidak dipakai untuk tes.

### Lebar tabel checklist

Tabel daftar template/assignment memenuhi lebar panel, dengan teks panjang dan
aksi membungkus di dalam sel. Empty-state memakai colspan 4 untuk template dan
6 untuk assignment agar tidak membentuk kolom kosong. Tabel modul ini memakai
layout responsif lokal dan mengecualikan resize kolom global yang menyimpan lebar
piksel. Tabel editor memenuhi modal; bila kolom kustom banyak atau layar sempit,
scroll horizontal hanya pada area grid agar formulir tetap dapat dibaca.
Fixture Chrome mengukur tabel daftar pada viewport 1280 dan 390 piksel serta
memeriksa tidak ada overflow halaman. Ini tidak mencakup seluruh viewport aplikasi.

### Jarak modal dan pencarian pilihan assignment

Modal Tambah/Ubah assignment menyusun label dan input secara vertikal, dengan
padding 28 piksel (20 pada layar kecil), jarak antarfield 20 piksel dan footer
aksi terpisah. Template dan assessor memakai dropdown pencarian: ketik judul
atau nama/username, pilih dengan klik atau panah/Enter. Escape saat daftar terbuka
menutup daftar dahulu; pilihan tidak mengubah ID/nama pengguna. Hasil kosong
menampilkan pesan Indonesia/English. Teks ketikan yang belum dipilih tidak dapat
disimpan sebagai ID; validasi form meminta pilihan yang sah.
Komponen lokal ChecklistSearchSelect.vue memakai combobox/listbox dan validasi
native. Daftar tampil dalam aliran modal agar tidak terpotong batas dialog.
Fixture Chrome memeriksa padding/grid, filter kedua pilihan, hasil kosong,
pemilihan via Enter dan payload assignment, bersama regresi alur sebelumnya.


### Penguatan keamanan 2026-11-09

Update record diperiksa pemilik/assessor sebelum parser multipart menerima file,
dan diulang di transaksi. API modul memakai private/no-store; unduhan evidence
memakai nosniff dan CSP sandbox yang sama dengan evidence utama. Upload baru juga
memeriksa magic bytes PDF/gambar/OLE/ZIP selain ekstensi/MIME; ini bukan antivirus,
validasi struktur Office lengkap, atau jaminan dokumen bebas macro/konten aktif.
File lama tidak diubah. Impor Excel UI memakai Web Worker dengan timeout 15 detik,
preflight ZIP maksimum 256 entry/25 MiB expanded, serta verifikasi ukuran aktual
hasil deflate sebelum SheetJS. Ukuran file input tetap maksimum 5 MiB. Arsip tidak
valid/encrypted/ZIP64, formula, dan dimensi berlebih ditolak. Worker tidak membekukan
UI; tidak mengklaim batas heap OS atau menghapus kebutuhan scanning malware.
