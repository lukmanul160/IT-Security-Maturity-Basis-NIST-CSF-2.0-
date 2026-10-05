# Panduan penggunaan NIST Basis

Panduan ini mengikuti modul pada source aplikasi 2 Oktober 2026. Untuk instalasi,
baca [Linux dan Windows](INSTALLATION.md). Tombol yang tersedia mengikuti role
dan izin aksi yang ditetapkan administrator.

## Login dan pengaturan akun

Pada instalasi baru, seed menyediakan akun berikut pada mode manual maupun
Docker, termasuk production:

| Username | Password awal | Role |
| --- | --- | --- |
| `admin` | `AdminInitial123!` | admin |
| `user` | `UserInitial123!` | user |

Buka `http://localhost:8000/login` untuk instalasi manual atau
`http://localhost:5000/login` untuk Docker dengan port default.
**Segera ganti password kedua akun setelah login pertama**, sebelum memberikan
akses kepada pengguna lain. Buka **Account → Account Management**, isi
**Password saat ini**, **Password baru**, dan **Konfirmasi password**, lalu klik
**Save profile**. Password baru harus 8–72 karakter, maksimal 72 byte, serta
mengandung huruf besar, huruf kecil, dan angka. Login kembali dengan password
baru dan ulangi untuk akun lainnya.

Password awal hanya berlaku untuk akun yang baru dibuat oleh seed. Restart,
rebuild, dan provisioning tidak menimpa akun/password yang sudah ada. Pada
instalasi lama, gunakan password yang berlaku atau minta administrator mereset
password melalui pengelolaan akun.

1. Buka `/login` pada alamat aplikasi dan masuk dengan akun yang diberikan admin.
2. Pilih **Account** untuk profil, perubahan password, dan pengaturan yang diizinkan.
3. Administrator mengelola user, role, izin baca/tambah/edit/hapus, dan SMTP terpusat.

Role yang tersedia: `admin`, `approver`, `editor`, `viewer`, dan `user`. Izin
per modul dapat disesuaikan; gunakan Account Management untuk melihat assignment
sebenarnya, bukan hanya nama role. Restart backend mengakhiri session aktif dan
membutuhkan login kembali.

## NIST CSF dan Privacy Assessment

1. Pilih framework dari sidebar atau **Choose framework**.
2. Buka assessment yang dibutuhkan, lalu pilih Function/Category/control.
3. Isi nilai Policy/Practice sesuai skala pada halaman, catatan, serta evidence.
4. Upload evidence baru atau pilih evidence yang sudah tersedia.
5. Gunakan dashboard/radar untuk memeriksa ringkasan, target, completion, dan gap.

Assessment disimpan melalui API ke PostgreSQL. Tunggu status penyimpanan sebelum
menutup halaman. Referensi evidence tersimpan bersama assessment, tetapi berkas
fisiknya disimpan pada storage server.

## ISO 27001

Gunakan tab dashboard, sasaran keamanan informasi, kalender evaluasi, Clauses
4–10, dan SOA. Isi evidence dan informasi sesuai kontrol, lalu kelola sasaran,
indikator, target, owner, serta periode evaluasi yang diperlukan. Aksi perubahan
kontrol mengikuti permission modul.

## Risk Management

### Menyiapkan pilihan formulir

Buka **Risk Management → 3. Pengelolaan Pilihan**:

1. Gunakan filter jenis untuk **Effected asset**, **Risk category**, atau
   **Nama perangkat**. Risk owner dan Treatment action juga tersedia.
2. Klik **Tambah pilihan**, isi jenis, nama, dan urutan, lalu **Simpan pilihan**.
3. Gunakan **Edit** untuk memperbarui pilihan tersimpan.
4. Gunakan **Hapus** untuk pilihan yang belum dipakai pada risk register.

Dropdown formulir risk register langsung diperbarui. Pilihan yang sudah dipakai
tidak dapat diganti nama/jenis atau dihapus; urutannya tetap dapat diubah. Nilai
lama yang hanya berasal dari risk register diberi keterangan **Dari risk
register**; **Simpan pilihan** mendaftarkannya ke daftar pilihan. Pesan kesalahan
atau nama duplikat tampil pada tab. Lihat [detail pengelolaan pilihan](risk-options.md).

### Membuat risk register

1. Klik **New risk**; Risk ID dihasilkan otomatis.
2. Pilih category, asset, dan perangkat. Isi identification risk, likelihood,
   impact, serta informasi pendukung.
3. Isi CIA, owner, treatment, deadline, dan residual risk bila diperlukan.
4. Klik **Save risk**. Periksa data pada **2. Risk Register**.
5. Gunakan filter/pencarian untuk menemukan risiko dan dashboard untuk ringkasan.

Likelihood dan impact memakai nilai 1–5. Rating serta nilai aset dihitung oleh
aplikasi. Reset risk register menghapus data register dan daftar pilihan;
gunakan sesuai izin dan konfirmasi yang ditampilkan aplikasi.

## Risk Acceptance

Buat formulir risk acceptance, isi requestor, asset, department, deskripsi risiko,
justifikasi manfaat, mitigasi, serta keputusan yang diperlukan. Simpan untuk
memasukkannya ke register. PDF per formulir dan ekspor/report register tersedia
sesuai aksi pada halaman.

## Threat Modelling

1. Buka **Threat Modelling** di sidebar, di bawah Personnel Certification.
2. Klik **New** untuk diagram kosong atau **Example diagram** sebagai contoh.
3. Klik/drag shape ke kanvas: external entity, process, service/API, data store,
   trust boundary, dan note.
4. Seret komponen untuk mengatur posisi. Tarik handle sudut kanan bawah untuk resize.
5. Klik **Connect**, lalu komponen sumber dan tujuan untuk membuat aliran data.
6. Pilih komponen/panah, lalu edit label, deskripsi, dan properti pada panel kanan.
7. Pada **Threats**, klik **Add**. Isi judul, kategori STRIDE, severity, status,
   dan mitigation. Threat register merangkum seluruh ancaman.
8. Klik **Save diagram**; pilih diagram tersimpan dari dropdown untuk membukanya.

Undo/redo, zoom, dan Fit tersedia. Shortcut: Ctrl+S save, Ctrl+Z undo,
Ctrl+Shift+Z redo, Delete hapus pilihan, Esc kembali ke select. Jika pengguna
lain telah menyimpan versi baru, save lokal ditolak agar tidak menimpa perubahan;
export JSON lokal sebelum memuat ulang. Perubahan diagram disimpan ke database
saat memilih Save, bukan autosave.

Export JSON memuat diagram dan ancaman. Import JSON membuka file sebagai diagram
baru, lalu pengguna memilih Save. Export SVG menyimpan gambar vektor. Report/PDF
mengunduh HTML berisi diagram dan threat register untuk cetak/simpan PDF. Format
JSON khusus aplikasi; tidak menerima file XML `.drawio`. Jika gagal memuat, baca
pesan di halaman dan pilih **Coba lagi** setelah koneksi/backend tersedia.
Lihat [detail Threat Modelling](threat-modelling.md).

## Policy Register dan reminder

Kelola kebijakan, kategori, owner, review cycle, approval status, lampiran, dan
subjudul/item kebijakan pada register. Dashboard menampilkan ringkasan dan
kalender review. Untuk reminder, administrator menyiapkan SMTP melalui Account,
lalu mengatur jadwal, penerima, serta konten di modul. Aplikasi server harus
tetap berjalan agar scheduler mengirim reminder. Lihat
[panduan reminder](policy-email-reminders.md).

## Personnel Certification

1. Buka tab **Personnel Register** dan daftarkan pegawai dengan nama, employee ID,
   jabatan, dan atasan langsung jika ada.
2. Pilih pegawai terdaftar ketika menambahkan sertifikasi; satu pegawai dapat
   memiliki beberapa sertifikasi.
3. Isi certification, issuer, status, issue/expiry date, dan informasi lainnya.
4. Gunakan struktur organisasi, peta sertifikasi, serta reference roadmap untuk
   memeriksa hubungan dan kebutuhan sertifikasi.

Pegawai yang masih mempunyai sertifikasi tidak dapat dihapus. Aksi pegawai dan
sertifikasi mempunyai permission tersendiri; tidak semua role yang dapat
menambah sertifikasi dapat mengubah daftar pegawai.

## Third-Party Risk Management

Gunakan halaman TPRM Framework, Vendor Tiering Matrix, Due Diligence Questionnaire,
Questionnaire Templates, dan TPRM Risk Register. Daftarkan vendor, isi kuesioner,
tentukan tier/result sesuai penilaian, lalu tautkan risk register yang relevan.
Periksa jadwal review dan status pada register vendor.

## Audit Finding Tracker

Gunakan tracker untuk mencatat hierarki audit, temuan, evidence, severity,
status, dan jadwal tindak lanjut. Reminder mengikuti SMTP terpusat serta
pengaturan modul. Detail alur tersedia di [Audit Finding Tracker](audit-finding-tracker.md).

## Uploaded files dan lokasi storage

Uploaded files menampilkan evidence yang disimpan aplikasi. Gunakan Open,
Download, Replace, atau Delete sesuai izin dan kepemilikan. Memilih evidence
yang sudah tersedia membuat referensi; tidak menggandakan berkas fisik.

Administrator dapat memilih storage lokal atau folder shared melalui pengaturan
storage. Folder shared harus dapat diakses **akun server**, bukan hanya browser
pengguna. Setelah memindahkan server/OS, periksa kembali path storage dan akses
berkas. Database backup tidak membawa isi folder evidence.

## Import, export, dan report per modul

Toolbar tersedia pada CSF, Privacy, ISO 27001, Risk Acceptance, Risk Management,
Policy Register, dan Personnel Certification:

| Aksi | Penggunaan |
| --- | --- |
| Template Import | Unduh struktur JSON dan header. Baca instructions, isi bagian data, lalu simpan file. |
| Import JSON | Pilih file modul yang sama (maksimal 10 MB), tinjau pratinjau, lalu konfirmasi import. |
| Export JSON | Unduh seluruh data tersimpan modul; filter tabel tidak membatasi export. |
| Report / PDF | Unduh laporan HTML, buka file, lalu pilih Cetak / Simpan PDF. |

Risk Management mengekspor risk register. ISO mencakup requirements, SOA, dan
sasaran. Personnel mencakup pegawai serta sertifikasi. Threat Modelling memakai
toolbar dan format file khusus diagramnya sendiri.

Import register memperbarui ID yang cocok dan menambah record baru; assessment
diganti dengan state file. Import beberapa record bukan transaksi atomik; bila
gagal, data yang sudah tersimpan tetap tersimpan dan jumlahnya ditampilkan.
Gunakan export dari instalasi yang sama untuk update berdasarkan ID database.
Template assessment kosong dapat mengosongkan assessment saat diimport.
File evidence fisik tidak disertakan. Lihat [detail transfer modul](module-import-export-report.md).

## Database Backup dan recovery

Administrator memilih **Database Backup → Create backup**, lalu Download.
Dump mencakup seluruh database aplikasi, termasuk akun/izin, assessment, seluruh
register, diagram, pengaturan, dan audit. `pg_dump` diperlukan; aplikasi tidak
menghasilkan snapshot JSON parsial sebagai pengganti backup lengkap.

Untuk recovery, salin juga evidence/storage, `.env`, serta `data/smtp-secret.key`.
Restore mengganti data database tujuan. Pastikan memakai backup yang benar dan
lakukan saat tidak ada penulisan pengguna/scheduler. Lihat
[cakupan backup](database-backup.md) dan [prosedur instalasi/recovery](INSTALLATION.md#9-backup-restore-dan-pindah-os).

## Jika tombol tidak aktif atau perubahan tidak terlihat

Periksa pesan status halaman dan permission akun. Tombol seperti undo/delete
selection baru aktif setelah ada histori atau elemen dipilih. Jika API gagal,
administrator perlu memeriksa database/backend. Setelah versi aplikasi berubah,
backend perlu restart dan frontend perlu build; lakukan Ctrl+F5 dan login
kembali. Untuk Threat Modelling, gunakan Coba lagi jika pesan load error muncul.
