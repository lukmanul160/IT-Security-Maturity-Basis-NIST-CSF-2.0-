Surat pernyataan tersedia melalui sidebar **Compliance → Surat Pernyataan**.

Administrasi berada di area konten dashboard `/app`, mengikuti sidebar dan tema aplikasi. Alamat administrasi lama `/compliance/surat-pernyataan` mengarahkan ke menu ini. Portal publik `/surat-pernyataan` memakai autentikasi karyawan terpisah dari login dashboard. Formulir `/surat-pernyataan/:id?year=2026` memerlukan sesi portal dan penugasan yang sesuai.

Tiga jenis awal berasal dari dokumen di `upload/complience/`: Benturan Kepentingan, Kode Etik, dan Pakta Integritas. Template mempertahankan seluruh halaman sumber, termasuk Kode Etik dan Pakta Integritas yang ada dalam file Benturan Kepentingan, sesuai pilihan pengguna. Kop, logo, tabel, penomoran, format paragraf, margin, header, dan footer disimpan sebagai DOCX asli. Identitas contoh dan gambar tanda tangan contoh diganti dengan isian pengguna. Salinan template tersimpan di `templates/statements/` agar tidak bergantung pada folder upload lokal saat deployment.

Dashboard menampilkan jumlah jenis surat, tautan aktif, pengisian, dan jenis surat yang telah diisi. Di tab **Template & field**, petugas dapat membuat jenis baru, menduplikasi jenis yang sudah ada, mengunggah file DOCX (maksimum 5 MB), mengatur field, melihat pratinjau, mengunduh template, dan menyalin tautan publik. Jenis baru berupa draf sampai diaktifkan. Nonaktifkan jenis surat untuk menutup pengisian publik tanpa menghapus riwayat.

Tombol **Edit dokumen** membuka editor DOCX di dalam dashboard. Edit teks dan format dengan toolbar, ubah isi tabel, lalu gunakan **Sisipkan field** pada posisi kursor untuk menambahkan placeholder yang sudah terdaftar. **Simpan template** mengekspor Word dari editor dan menyimpannya ke database; formulir publik memakai revisi terbaru. Perubahan belum tersimpan dikonfirmasi sebelum editor ditutup. Revisi diperiksa server untuk mencegah perubahan dari tab lama menimpa template yang baru disimpan di tab lain. Surat yang sudah ditandatangani tetap memakai dokumen pada saat pengisian. Editor menggunakan SuperDoc 1.47.2 (AGPL-3.0), dimuat lokal hanya saat dibuka, tanpa mengirim dokumen ke layanan eksternal; paket lisensi berada di dependensi npm.

Gunakan **+ Field kustom** di editor untuk menentukan kunci, label, jenis, pilihan dropdown, dan status wajib. Field baru disimpan bersama dokumen saat **Simpan template**, sehingga pembaruan dokumen dan formulir publik terjadi dalam satu revisi. Klik posisi yang diinginkan, lalu pilih **Sisipkan field**. Tombol **Sisipkan tanda tangan** menambahkan `{{tanda_tangan}}` tepat pada posisi kursor. Saat surat diisi, placeholder diganti menjadi gambar pada lokasi yang sama, termasuk di tengah paragraf, sel tabel, header, atau footer. Placeholder dapat dipindah seperti teks biasa. Jika template contoh diberi posisi tanda tangan eksplisit, posisi eksplisit tersebut menggantikan slot tanda tangan contoh, bukan menambah duplikat di slot lama.

Tombol **Unggah template Word** membuka pembuatan jenis dari file `.docx` (maksimum 5 MB). Panel **Contoh dokumen & panduan unggah** menyediakan contoh dasar siap isi serta tiga dokumen sumber lengkap. Unduhan contoh memerlukan login dan izin baca. File contoh dasar menggunakan seluruh placeholder bawaan dan posisi tanda tangan, lalu dapat diubah di Word atau editor aplikasi sebelum diunggah sebagai jenis baru. Template baru dimulai sebagai draf.

Pratinjau membaca posisi `wp:anchor` pada kop Word sehingga logo Danantara tetap di kiri dan logo BRI Insurance tetap di margin kanan. Perbaikan ini hanya memengaruhi perenderan browser, tanpa mengubah posisi atau gambar di file Word sumber.

Field mendukung teks, teks panjang, pilihan/dropdown, tanggal, email, dan angka. Setiap field memiliki kunci, label, pilihan wajib, pengaturan dapat diisi publik, dan nilai tetap jika diisi petugas. Nama dan NIP wajib sebagai identitas pengisi dan diambil dari profil karyawan pada server. Nilai tetap divalidasi dan diterapkan server; data kiriman pengunjung tidak dapat menggantinya. Placeholder bawaan: `{{status}}`, `{{nama}}`, `{{nip}}`, `{{jabatan}}`, `{{penyedia}}`, `{{tempat}}`, dan `{{tanggal}}`. Untuk field baru misalnya kunci `unit`, tulis `{{unit}}` di posisi yang diinginkan dalam template Word. Pakai `{{tanda_tangan}}` untuk menempatkan gambar tanda tangan di template Word baru. Template contoh sudah memiliki posisi tanda tangan. Unduh, edit di Word, lalu unggah kembali untuk mengubah isi atau format. Menghapus field yang masih memiliki placeholder dalam Word ditolak; field dapat dipertahankan sebagai nilai tetap.

Penerima tautan mengisi field yang diizinkan, menggambar tanda tangan dengan mouse/pena/sentuhan, dan mencentang persetujuan setelah masuk portal karyawan, tanpa akun dashboard. Penyedia jasa wajib untuk pekerja Outsource bila field tersebut tersedia. Setelah dikirim, penerima mendapat nomor penerimaan dan file Word bertanda tangan untuk langsung diunduh. Dokumen final dan konfigurasi field pada saat pengisian disimpan bersama riwayat. Unduhan surat tersimpan hanya dapat diakses petugas berizin; respons pengiriman memberikan file kepada pengisi saat itu saja.

Pratinjau menggunakan `docx-preview` dengan style terisolasi agar tidak mengubah dashboard. Tampilan/paginasi browser dan cetak PDF browser dapat sedikit berbeda dari Microsoft Word. File unduhan DOCX mempertahankan format Word sumber; field diisi melintasi run Word tanpa meratakan formatnya. Seluruh halaman tetap disertakan. Untuk hasil cetak sesuai Word, buka file DOCX di Microsoft Word lalu cetak/ekspor PDF dari sana.

Di halaman pengelolaan, cari NIP (misalnya `333`) atau nama. Buka kelompok untuk melihat seluruh pengisian dan jumlah jenis surat yang telah diisi, lalu pilih **Lihat surat** untuk melihat atau mencetak surat beserta tanda tangannya. Pengisian ulang tetap disimpan sebagai riwayat terpisah. Identitas NIP dan nama mengikuti sesi portal serta profil karyawan yang didaftarkan petugas.

Izin modul `surat-pernyataan` mengikuti mekanisme izin aplikasi (Read/Add/Edit). Endpoint riwayat memerlukan login dan Read. Pembuatan jenis memerlukan Add; perubahan isi/publikasi memerlukan Edit. Isi surat, revisi, identitas, persetujuan, dan koordinat tanda tangan disalin pada saat pengiriman; perubahan template selanjutnya tidak mengubah surat yang sudah masuk. Tanda tangan berupa gambar goresan, bukan sertifikat tanda tangan digital.

Tabel dan tiga template awal diinisialisasi secara idempoten oleh `src/server.js` saat aplikasi dimulai. Setelah pembaruan, restart proses server dan gunakan hasil build client terbaru.

Pemeriksaan:

```powershell
npm.cmd run test:statements
node scripts/test-statements-integration.js
node scripts/test-statements-browser.js
npm.cmd run build:client
```

Uji integrasi memakai schema sementara dalam transaksi yang dibatalkan. Uji browser membutuhkan Chrome lokal dan akun admin yang sudah ada; membuat jenis/pengisian uji dan menghapusnya kembali. Browser test juga menginisialisasi tabel dan template bawaan bila belum ada.

Data masuk menyediakan tabel field kustom, pencarian seluruh nilai, filter jenis surat dan nilai field, serta pengelompokan menurut field pilihan. Tabel menampilkan 50 surat per halaman; pengelompokan menampilkan 50 kelompok per halaman dan hingga 100 surat terbaru per kelompok. Field historis tetap tersedia walaupun template telah berubah.

Formulir publik menyediakan metode gambar langsung atau unggah PNG/JPG hingga 5 MB. Gambar dinormalisasi menjadi PNG transparan 1000 x 400 di browser, divalidasi dan disandikan ulang di server, kemudian ditaruh pada placeholder tanda tangan dalam dokumen.

Tab Rekap NIP & Tahun merangkum jenis surat yang diisi per pegawai dan tahun input (zona Asia/Bangkok). Surat berulang tidak menambah jumlah jenis yang selesai. Kelengkapan dibandingkan jenis surat yang saat ini aktif; tabel juga menampilkan dokumen yang belum diisi. Rekap dapat dicari berdasarkan NIP/nama dan difilter tahun.

Untuk filter Departemen, klik Kelola pada template, lalu Tambah field Departemen, atur teks atau dropdown beserta pilihan departemen, kemudian simpan. Field muncul di formulir publik dan tersedia pada Filter field serta Kelompokkan berdasarkan di tab Data masuk. Dokumen lama tanpa field ini dikelompokkan sebagai nilai kosong.

Tab Karyawan menyediakan unduhan template Excel, pratinjau impor, penyimpanan profil, filter Departemen, pilihan pegawai, dan penugasan jenis surat aktif per tahun. Maksimal 500 baris per impor; NIP wajib teks agar nol awal tetap terjaga. Password baru otomatis NIP dan disimpan sebagai hash bcrypt; impor ulang mempertahankan password serta status aktif yang sudah ada.

Perubahan password hanya melalui endpoint admin dan tombol Ubah password per pegawai atau Ubah password pegawai terpilih (maksimal 500). Admin dapat reset masing-masing menjadi NIP atau menetapkan satu password baru minimal 8 karakter. Reset membatalkan seluruh sesi portal pegawai sasaran. Portal tidak menyediakan perubahan password mandiri dan tidak menggunakan email/SMTP.

Karyawan masuk dengan NIP dan password pada portal publik; tidak memerlukan akun dashboard. Cookie HttpOnly terpisah dengan masa berlaku delapan jam; server memeriksa sesi, keaktifan pegawai, jenis surat, dan penugasan tahun pada setiap akses. NIP/nama kiriman tidak dapat menggantikan identitas sesi. Tahun penugasan disimpan terpisah dari tanggal input. Departemen dari direktori ikut disimpan untuk pelaporan jika template tidak menyediakan field departemen sendiri.

Tab Rekap NIP & Tahun menyediakan ekspor Excel daftar pengisi dan ZIP semua dokumen Word asli yang telah ditandatangani. Pilih Tahun ekspor dan dasar Tahun input atau Tahun penugasan. Excel berisi ringkasan per NIP serta detail seluruh pengisian, termasuk pengisian ulang. ZIP menyertakan Excel, petunjuk, dan semua versi surat pada folder NIP dengan ID unik. ZIP membaca dokumen bertahap dari database agar seluruh file tidak dimuat sekaligus di memori server. Ekspor memerlukan izin baca Surat Pernyataan.

Tab Karyawan memiliki tombol Tambah karyawan untuk pendaftaran manual. NIP harus unik dan password awal otomatis NIP. Profil serta template/impor Excel mendukung Email opsional dengan validasi alamat. Template baru menambahkan Email pada kolom terakhir; template lama enam kolom tetap diterima dan tidak menghapus email yang sudah tersimpan.

Admin dapat membuka Lihat surat lalu Hapus surat. Konfirmasi menampilkan judul, NIP, dan ID. Penghapusan permanen menghapus data serta dokumen pengisian, sedangkan penugasan tetap ada dan kelengkapan dihitung ulang dari pengisian yang tersisa. Endpoint DELETE menolak akun non-admin.

Seluruh tabel administrasi memakai pagination: template surat memiliki pilihan 10/25/50 baris; karyawan, penugasan, data masuk dan rekap 50 baris; pratinjau impor 50 baris. Tabel dalam kelompok menampilkan 25 baris per halaman dari 100 data pratinjau. Lihat seluruh data kelompok beralih ke filter persis dengan pagination server sehingga seluruh pengisian kelompok tetap dapat diakses.

Tersedia dua aksi password admin: Ubah password pegawai terpilih (maksimal 500) dan Ubah password semua pegawai. Aksi semua pegawai memakai seluruh direktori di server, termasuk nonaktif, tanpa dipengaruhi filter/pagination atau batas 500 pilihan. Kedua aksi hanya menerima password baru yang berbeda dari NIP. Pembaruan seluruh sasaran serta invalidasi sesi dilakukan atomik setelah hash selesai disiapkan.

Pilih semua hasil filter (semua halaman) mencentang seluruh karyawan yang cocok dengan pencarian/departemen, bukan hanya 50 baris yang tampil. Pilihan bertahan saat berpindah halaman; jumlah pegawai terpilih menunjukkan total lintas halaman. Daftar direktori tidak dipotong pada 10.000 karyawan.

Daftar Karyawan memiliki filter Tahun penugasan serta indikator Ditugaskan, Sudah diisi, Belum diisi, Total pengisian dan Kelengkapan. Jumlah mengikuti seluruh penugasan masing-masing NIP pada tahun pilihan, tidak dibatasi tiga jenis awal. Pengisian berulang untuk satu surat dihitung satu penugasan selesai; seluruh kiriman tetap dihitung pada Total pengisian. Lihat penugasan membuka rincian dokumen, jumlah kiriman, dan waktu input terakhir, dengan pagination.

Tab Dashboard Monitoring berada di modul Surat Pernyataan dengan filter tahun penugasan. Kartu merangkum karyawan terdaftar, ditugaskan, lengkap/belum lengkap/belum ditugaskan, total penugasan, penugasan selesai, dan total pengisian. Grafik progres serta tabel per jenis surat dan departemen dihitung dari penugasan aktual, termasuk nonaktif. Kedua tabel memakai pagination 25 baris.


Pengerasan keamanan (17 Oktober 2026): password awal dan reset ke NIP dinonaktifkan. Akun baru memakai hash acak yang tidak dibagikan; admin harus menetapkan password baru melalui menu Ubah password sebelum akun dapat digunakan. Password yang sama dengan NIP ditolak. Sesi lama sebelum kebijakan ini perlu masuk kembali; sesi baru tetap dicabut saat password berubah.

Unggahan DOCX diperiksa hingga ukuran hasil dekompresi aktual (maksimum 25 MB, 600 entry, file terkompresi maksimum 5 MB). XML dan relasi di semua bagian dokumen diperiksa; macro, objek tersemat, DDE/field eksternal, SVG, serta relasi eksternal termasuk atribut yang memakai entity XML ditolak. Impor Excel melewati validasi arsip yang sama. Permintaan portal dibatasi berdasarkan IP dan identitas karyawan; password dan tanda tangan tidak disalin ke audit log. Halaman portal menggunakan CSP dan no-store; cookie mengikuti konfigurasi Secure aplikasi.

Pemeriksaan kode, pengujian regresi, dan npm audit bukan jaminan tidak adanya seluruh kerentanan. Pembatasan permintaan saat ini berlaku per proses; deployment multi-instance perlu pembatasan terpusat di reverse proxy. Validasi dokumen bukan pemindaian antivirus atau sandbox Office.

Pembaruan batas editor: unggah, buka editor, dan simpan DOCX kini memakai **Edit dokumen Word (MB)** pada Account ? Website Setting, default 50 MB, dapat diatur 1?500 MB tanpa restart setelah kode backend terbaru dimuat. Ini menggantikan batas DOCX 5 MB dan dekompresi 25 MB yang dijelaskan di atas: dekompresi aktual dibatasi lima kali batas dokumen, tetap maksimum 600 entri. Batas impor Excel dan gambar tanda tangan tidak berubah. Dokumen `.doc` harus dikonversi ke `.docx`. Uji fixture memverifikasi batas file, bukan performa editor browser untuk dokumen 50 MB.
