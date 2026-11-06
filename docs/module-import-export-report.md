# Import, export, dan report modul

## Excel progres

**Import Excel**, **Export Excel**, dan **Template Excel** tersedia pada toolbar
ISO 27001/SOA/objectives, Risk Acceptance, Risk Management, Policy Register,
Personnel Certification, Vendor Questionnaire, Questionnaire Templates, TPRM,
Threat Modelling, Knowledge Notes, dan Audit Finding Tracker.
Asset Register, Server Racks, dan Asset Modelling menggunakan tombol Excel pada
header Asset Management. Anggaran menggunakan template Anggaran yang tersedia.

Export mengambil seluruh data tersimpan, termasuk status, catatan, nilai,
relasi, dan field tambahan, tanpa mengikuti filter tabel. Setiap bagian mempunyai
sheet tersendiri. Gunakan hasil Export Excel untuk melanjutkan progres, atau
Template Excel untuk mengisi data baru. Pertahankan nama sheet, header, ID,
dan sheet `_Progress`. Object/array dalam sel memakai awalan `@json:`;
teks literal yang diawali `@` disimpan dengan `@text:`. Nilai nol dan boolean
dipertahankan. Formula, header berubah, modul berbeda, dan sheet hilang ditolak.
Batas 10 MB, 5.000 baris per sheet, dan 32.767 karakter per sel. Data lebih panjang
memakai JSON atau backup. Impor Excel memakai validasi, pratinjau, izin API,
dan pencatatan audit yang sama dengan impor JSON.

Audit diimpor sesuai urutan Audit → Finding → Follow-up → Evidence, dengan
pemetaan ID induk baru. File evidence tetap berupa referensi berkas yang dapat
diakses pengguna. Excel aset mencakup register, rak, penempatan, relasi, kanvas,
dan pengaturan reminder; foto dipindahkan menggunakan JSON atau backup file.
Catatan pengetahuan mencakup teks dan folder catatan; gambar memakai ZIP/backup.

Assessment CSF dan Privacy **selalu menggunakan template asli**
`data/maturity-template.xlsx`; IKAS memakai `data/ikas-template.xlsx` atau
template IKAS yang sudah tersimpan. Tombol Excel assessment memakai layanan
template tersebut, termasuk pada halaman pengelolaan kontrol. Lihat
[panduan maturity Excel](maturity-excel.md).

Persetujuan workflow tetap mengikuti aturan modul. Risk Management mengimpor
field register melalui API biasa; perubahan dapat meminta review ulang, dan
status Closed tidak dapat ditetapkan melalui spreadsheet. Anggaran mengimpor
pengajuan sebagai draft baru; status persetujuan dan realisasi pada ekspor
merupakan informasi progres dan tidak diimpor untuk melewati proses approval.
Untuk pemulihan lengkap riwayat workflow antarinstalasi, gunakan Database Backup.

Toolbar tersedia pada NIST CSF Assessment, NIST Privacy Assessment, ISO 27001,
Risk Acceptance, Risk Management, Policy Register, Personnel Certification,
Vendor Due Diligence Questionnaire, Questionnaire Templates, dan TPRM Risk Register.
Risk Acceptance mengikuti nama modul aplikasi yang sudah ada.

- **Template Import** mengunduh JSON khusus modul dengan `format`, `version`,
  `module`, `headers`, `instructions`, dan `data`. Header menunjukkan nama field
  yang digunakan saat import. Isi bagian `data`; bagian panduan tidak disimpan.
  Risk Management menyertakan contoh risk register dalam `examples` yang dapat
  disalin ke `data.register` lalu disesuaikan. Template memakai daftar kosong
  agar contoh tidak otomatis tersimpan. Assessment kosong mengganti state dengan
  data kosong, sehingga isi assessment sebelum import.
- **Panduan import / export** pada setiap toolbar menjelaskan cakupan data,
  format file, pratinjau import, serta cara menyimpan laporan sebagai PDF.

- **Export JSON** mengambil seluruh data modul terbaru dari API, termasuk metadata
  versi, nama modul, dan waktu export. Filter tabel tidak membatasi export.
- **Import JSON** menerima file hasil export modul yang sama (maksimal 10 MB).
  Pratinjau menjelaskan jumlah data dan perilaku penyimpanan. ID yang sudah ada
  diperbarui, ID baru dibuat melalui API. Tidak ada penghapusan register. State
  assessment NIST diganti dengan state dari file. Gunakan file dari instalasi
  yang sama: ID database bukan identitas yang portabel antarinstalasi.
- **Report / PDF** mengunduh laporan HTML dengan ringkasan dan kolom sesuai modul.
  Buka file HTML lalu pilih **Cetak / Simpan PDF**. Semua teks data di-escape.

ISO mencakup requirements, SOA, dan information security objectives. Personnel
mencakup organisasi pegawai dan sertifikasi; ID pegawai hasil import dipetakan
ke sertifikasi. Policy Register menyertakan item/subjudul kebijakan. Risk
Management mencakup risk register; import/export spreadsheet yang sudah tersedia
tetap dapat digunakan. PDF per formulir Risk Acceptance juga tetap tersedia.

Referensi evidence dan attachment disertakan dalam JSON; berkas biner tidak
disertakan. Berkas tersebut harus tersedia di server untuk dapat dibuka.
Vendor questionnaire menyertakan responses dan referensi dokumen. Questionnaire
Templates menyertakan sections dan is_default. TPRM menyertakan penilaian CIA,
questionnaireId, serta riskRegisterIds. Import vendor questionnaire dan Risk
Management terlebih dahulu jika referensinya belum tersedia, lalu sesuaikan ID
lokal pada file TPRM. Referensi vendor dan risiko diperiksa sebelum penulisan TPRM.
Endpoint API tetap memeriksa izin baca/tulis pengguna. Import berjalan berurutan;
jika satu request gagal, proses berhenti dan menampilkan jumlah data yang telah
tersimpan. Proses ini bukan transaksi atomik untuk seluruh file. Tinjau data
sebelum mencoba kembali, terutama bila file berisi record baru tanpa ID lokal.

Pengujian: `node --test test/moduleTransfer.test.js`, `npm run build:client`,
`npm run test:browser` (server dan akun pengujian diperlukan).

## Rincian dan Excel gap assessment

Tab Gap pada NIST CSF dan Privacy menyediakan Export Excel Gap. Workbook khusus
gap berisi seluruh gap tersimpan pada framework tersebut, tanpa mengikuti filter
atau halaman, dengan urutan header: No, Domain, Sub, People/ Process/ Technology,
Gap Number, Gap, Client, PIC, Initiative, Recommendation, Year of Initiative,
Kuartal, Konfirmasi, Evidence/ Dokumen Pendukung, Decision Note.
No dihitung otomatis pada daftar/ekspor. Rincian lainnya dapat diisi melalui
Tambah/Edit gap; Gap adalah deskripsi wajib. Status Open/Closed tetap dikelola
terpisah. Rincian opsional maksimal 4000 karakter per field. Evidence pada Excel
berisi catatan dokumen serta nama/path file terkait, bukan isi berkas.
Gap lama tetap tersedia; rincian yang belum diisi kosong, dan Sub pada ekspor
memakai kode kontrol jika belum diisi. Metadata rincian ikut JSON gap/import.
Restart backend untuk migrasi penambahan kolom JSONB otomatis. Ekspor ini terpisah
dari template maturity dan tidak menyediakan impor Excel gap.

Verifikasi: build frontend dan test fixture/mock gap serta pembacaan ulang workbook
Excel. PostgreSQL nyata, browser, dan Docker belum diuji langsung untuk perubahan ini.

Decision (header Excel tetap **Decision Note**) memakai dropdown dengan tepat tiga
pilihan: **Comply**, **Partially Comply**, **Not Comply**. Pilihan wajib saat
menyimpan rincian gap melalui formulir atau API/import yang menyertakan details.
Payload lama tanpa details tetap didukung. Data lama tidak diubah otomatis; saat
mengedit nilai lama/kosong, pilih salah satu nilai yang sah. Excel mengekspor
nilai tersimpan; data lama tetap ditampilkan sampai diperbarui pengguna.

Pada daftar Pemantauan gap, Edit/Ubah kesenjangan langsung memfokuskan formulir
di bagian atas dialog. Setelah simpan berhasil atau Batal edit, dialog kembali
ke filter, halaman, dan posisi scroll daftar semula. Jika perubahan membuat
gap keluar dari filter (misalnya Open menjadi Closed), daftar mengikuti filter
semula dan halaman disesuaikan bila jumlah halaman berkurang. Simpan gagal
tetap berada di formulir agar dapat diperbaiki.
Verifikasi alur navigasi menggunakan fixture DOM; browser nyata belum diuji.

Gap NIST CSF terhubung ke kontrol CSF Core melalui controlCode. Domain mengikuti
Function kontrol (bagian sebelum titik dua, contoh GOVERN (GV)), dan Sub mengikuti
kode Subcategory (contoh GV.OC-01, bukan ID internal GV-OC-01). Field tersebut
otomatis dan hanya-baca pada formulir. Backend mengabaikan isian manual Domain/Sub
dan mengambil metadata kontrol untuk simpan, import, daftar, serta ekspor Excel.
Metadata mengikuti kontrol pada tahun assessment yang dipilih, termasuk gap lama,
tanpa migrasi yang menulis ulang data operasional. Field lainnya tetap dipertahankan.
Verifikasi memakai fixture/mock kontrol dan workbook; browser serta PostgreSQL nyata
belum diuji langsung untuk perubahan ini.

Field rencana gap menggunakan isian terstruktur: Kuartal memilih Q1/Q2/Q3/Q4,
Year of Initiative berupa angka tahun empat digit 1000?9999 (tanpa pecahan),
dan People/Process/Technology memilih salah satu People, Process, Technology.
Ketiganya boleh kosong jika belum ditentukan. API/import menolak nilai di luar
format tersebut. Excel mempertahankan nilai tahun dan kuartal yang disimpan.
Data lama tidak dikonversi otomatis; nilai nonstandar harus disesuaikan saat
menyimpan rincian. Decision tetap wajib memilih salah satu tiga nilai compliance.

Card ringkas hanya berlaku di tab Gap: maksimal 480px per card, padding lebih
kecil, dan detail dua kolom yang menyesuaikan layar. Card KPI Pemantauan Gap
dan dialog monitoring mempertahankan ukuran semula (dialog 820px).
Verifikasi melalui build frontend; browser nyata belum diuji langsung.

Form Tambah/Edit gap memakai ukuran sesuai jenis isian: Sub/Gap Number, tahun,
dan Kuartal memiliki lebar pendek serta berbagi baris. Domain, Client, dan PIC
memakai input satu baris. Initiative, Recommendation, Konfirmasi, deskripsi Gap,
dan dokumen pendukung tetap multiline. Konfirmasi memakai lebar penuh dan tinggi
awal yang sama dengan Recommendation, termasuk pada layar kecil. Field menyesuaikan lebar layar kecil;
ukuran card Pemantauan Gap tidak berubah. Verifikasi melalui test fixture form
dan build frontend, belum melalui browser nyata.

Lihat semua gap menampilkan detail tersimpan secara berdampingan mengikuti
panjang isinya, termasuk Kuartal/Tahun/PIC/Decision. Nilai panjang (>80 karakter)
atau multiline mendapat satu baris penuh agar tetap terbaca. Ukuran dialog dan
card KPI monitoring dipertahankan. Verifikasi lewat build dan fixture render;
browser nyata belum diuji untuk perubahan tata letak ini.

Gap Number menyediakan mode Otomatis dan Manual. Format otomatis adalah
G-{Sub}-{kategori}-{urutan minimal dua digit}; People=PE, Process=PR, Technology=T.
Contoh G-RS.CO-2-PE-01. Mode otomatis memerlukan Sub dan kategori. Nomor baru
mengikuti nomor urut tertinggi yang masih tersimpan untuk awalan yang sama.
Nomor otomatis yang sudah ada dipertahankan saat edit jika awalan tetap sesuai.
Mengubah Sub/kategori menghasilkan nomor sesuai awalan baru. Pratinjau form
bersifat sementara; server menentukan nomor akhir saat penyimpanan.
Nomor manual wajib diisi, maksimal 120 karakter (huruf, angka, titik, garis bawah,
tanda hubung); nomor dinormalisasi huruf besar. Nomor tidak boleh duplikat dalam
framework dan tahun assessment yang sama, termasuk impor. Tahun berbeda dapat
memakai nomor sama agar duplikasi assessment tahunan tetap didukung. Penyimpanan
legacy diserialisasi dengan advisory lock transaksi, sementara data tahunan
memakai lock baris periode. Data lama tanpa mode tetap didukung dan tidak diubah
secara massal. Excel mengekspor nomor yang telah tersimpan.
Verifikasi menggunakan fixture/mock dan build; PostgreSQL nyata serta browser
belum diuji langsung untuk penomoran.
