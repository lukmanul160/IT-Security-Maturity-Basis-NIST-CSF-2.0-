# Import, export, dan report modul

Toolbar tersedia pada NIST CSF Assessment, NIST Privacy Assessment, ISO 27001,
Risk Acceptance, Risk Management, Policy Register, dan Personnel Certification.
Risk Acceptance mengikuti nama modul aplikasi yang sudah ada.

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
Endpoint API tetap memeriksa izin baca/tulis pengguna. Import berjalan berurutan;
jika satu request gagal, proses berhenti dan menampilkan jumlah data yang telah
tersimpan. Proses ini bukan transaksi atomik untuk seluruh file. Tinjau data
sebelum mencoba kembali, terutama bila file berisi record baru tanpa ID lokal.

Pengujian: `node --test test/moduleTransfer.test.js`, `npm run build:client`,
`npm run test:browser` (server dan akun pengujian diperlukan).
