# Asset Management

Menu Asset Management menyediakan Asset Register, Rak Server, dan Modelling Asset Register. Semua data tersimpan di PostgreSQL; tabel dibuat otomatis saat startup. Restart backend dan jalankan `npm run build` setelah memperbarui kode.

## Asset Register

Daftarkan asset tag unik, nama, jenis, serial, vendor/model, pemilik, layanan bisnis, lokasi, kritikalitas, tanggal pembelian, renewal, dan akhir garansi. Gunakan siklus hidup planned, in-stock, in-use, maintenance, retired, disposed. Referensi change/tiket ITSM bersifat opsional, termasuk perubahan status. Lepaskan posisi rak dan relasi sebelum retirement. Aset operasional harus retired sebelum dihapus; planned dapat dihapus untuk memperbaiki pencatatan.

Untuk reminder, isi email pemilik dan tanggal renewal, pilih H- (0–365 hari), lalu aktifkan reminder email. Konfigurasikan SMTP terpusat melalui menu administrasi. Scheduler memeriksa saat startup dan setiap jam dengan tanggal Asia/Bangkok. Pengiriman maksimal sekali per aset/tanggal renewal/penerima/hari; reminder berlanjut setiap hari untuk renewal terlambat sampai tanggal diperbarui atau reminder dinonaktifkan. Retired/disposed tidak menerima reminder. Kegagalan SMTP dicatat di log dan dicoba kembali pada pemeriksaan berikutnya. SMTP tidak dapat menjamin exactly-once jika proses berhenti setelah email diterima SMTP sebelum delivery tersimpan. Log pengiriman disimpan pada asset_renewal_deliveries.

## Rak Server

Buat rak dengan lokasi dan kapasitas 1–60 U. Pilih perangkat fisik dari register, isi U awal dari bawah, tinggi perangkat, dan referensi change opsional. Pemasangan baru menolak aset yang sudah terpasang dan menampilkan lokasi raknya; gunakan Ubah posisi atau drag-and-drop untuk memindahkan perangkat; satu aset hanya memiliki satu posisi. Sistem menolak overlap dan kapasitas yang terlampaui, termasuk perubahan kapasitas rak. Lepaskan seluruh perangkat sebelum menghapus rak. Tampilan rak menampilkan posisi dari U tertinggi ke U terendah.

### Drag-and-drop perangkat

Seret perangkat pada diagram rak atau daftar perangkat ke U tujuan. Perangkat multi-U mempertahankan tinggi dan titik pegangan saat dipindahkan. Area tujuan menandai seluruh slot yang akan ditempati; overlap dan posisi di luar kapasitas ditolak. Untuk pemindahan antar rak, jatuhkan perangkat pada kartu rak tujuan di atas diagram. Sistem memilih rentang U kosong pertama yang muat.

Drop yang valid membuka modal penempatan dengan aset, rak tujuan, U awal, dan tinggi terisi. Periksa posisi, isi referensi change/tiket bila tersedia, lalu Simpan posisi. Batal/Esc tidak mengubah data. Posisi lama tetap berlaku sampai penyimpanan berhasil. Tombol Ubah posisi tetap tersedia untuk penggunaan keyboard atau perangkat tanpa drag-and-drop. Fitur seret mengikuti izin Edit Rak Server dan dinonaktifkan saat memuat/menyimpan.

### Tampilan depan/belakang dan foto

Tampilan menyerupai elevasi rack GLPI: dua sisi Depan/Belakang, nomor U di kedua tepi, dan satu blok utuh per perangkat. Tinggi blok mengikuti jumlah U (1U = 26 piksel pada diagram). Perangkat tanpa foto memakai label dan warna; sisi kebalikan orientasi ditandai pola garis. Tampilan tetap mengikuti tema workspace.

Pada modal penempatan, pilih orientasi Menghadap depan/Menghadap belakang dan kedalaman Full depth. Full-depth memakai U yang sama di kedua sisi; perangkat satu sisi hanya menempati sisi orientasinya. Perangkat satu sisi pada sisi yang berbeda dapat memakai rentang U yang sama. Data penempatan lama otomatis menjadi front/full-depth melalui migrasi startup. Drag-and-drop ke elevasi depan/belakang juga mengisi orientasi tujuan di modal; backend memeriksa benturan berdasarkan sisi dan kedalaman.

Unggah foto panel depan dan belakang langsung pada modal **Tambah aset** atau **Ubah aset** di **Asset Register**, pada bagian **Foto perangkat depan / belakang**. Data aset dan kedua foto disimpan dalam transaksi yang sama. Foto tersimpan pada aset sebelum penempatan; setelah aset di-place, rak otomatis mengambil foto itu. Kelola penggantian/penghapusan foto perangkat melalui Ubah aset, dengan izin Create/Update Asset Register. Format PNG/JPEG/WebP, maksimum 5 MB per sisi. Foto dipaskan ke lebar bidang perangkat dan tinggi U; gunakan foto panel yang sudah dipotong agar proporsinya sesuai. Foto depan tampil pada sisi orientasi perangkat, foto belakang pada sisi sebaliknya. Foto yang tidak tersedia memakai label warna. Checkbox **Tampilkan foto perangkat** beralih antara foto dan label tanpa mengubah data.

Klik **Foto rak depan / belakang** untuk mengunggah foto keseluruhan rak. Foto ini merupakan referensi, ditampilkan lewat **Foto rak depan/belakang** di bawah masing-masing diagram; foto keseluruhan rak tidak menggantikan posisi U perangkat. Upload, penggantian, dan penghapusan foto dilakukan melalui modal. Dua sisi disimpan dalam satu transaksi. Foto tersimpan sebagai BYTEA dalam PostgreSQL dan termasuk backup database; foto perangkat dapat dibaca melalui Read Asset Register atau Read Rak Server; perubahan foto perangkat membutuhkan Create/Update Asset Register melalui modal registrasi. Foto keseluruhan rak membutuhkan Read/Edit Rak Server. Penghapusan aset/rak menghapus foto terkait melalui foreign key cascade.

Rujukan: [GLPI rack items](https://help.glpi-project.org/documentation/modules/assets/tabs/rack_items) dan [GLPI pictures](https://help.glpi-project.org/documentation/tabs/common_fields/pictures).

## Modelling Asset Register

Pilih aset sumber dan tujuan dari register, tipe relasi, catatan, dan referensi change. Relasi yang tersedia: connects-to, depends-on, protects, balances, hosts, backs-up. Relasi duplikat dan relasi ke diri sendiri ditolak. Aset retired/disposed tidak dapat ditambahkan. Diagram menampilkan arah dan tipe relasi; tabel menyimpan referensi perubahan. depends-on berarti sumber bergantung pada tujuan; hosts berarti sumber berjalan pada host tujuan. Analisis ketergantungan menelusuri kedua tipe itu secara langsung maupun transitif; hasil merupakan dependensi yang tercatat, bukan simulasi gangguan jaringan.

## Formulir modal

Tambah/ubah aset, tambah/ubah rak, pemasangan/pemindahan perangkat, dan tambah/ubah relasi dibuka melalui modal dengan tema workspace. Konfirmasi hapus dan pelepasan perangkat juga memakai modal. Tombol Batal/Tutup atau Esc menutup modal; saat menyimpan, modal tetap terkunci untuk mencegah pengiriman ganda. Kegagalan API mempertahankan isi formulir serta menampilkan pesan kesalahan di modal. Penyimpanan berhasil menutup modal dan memuat ulang data. Ubah relasi memerlukan izin Edit pada Modelling Asset Register.

## ITSM dan akses

Implementasi mengikuti prinsip IT asset lifecycle, ownership, dan service configuration management/CMDB dari [Atlassian IT Asset & Service Configuration Management Guide](https://www.atlassian.com/collections/service/guides/it-asset-service-configuration-management). Referensi tiket/change menghubungkan perubahan ke proses organisasi; modul ini tidak menyediakan approval workflow atau integrasi ticketing eksternal.

Read/Add/Edit/Delete tersedia terpisah untuk setiap submenu pada pengaturan akun. Viewer hanya membaca; editor/user dapat menambah dan mengubah; hapus secara bawaan untuk admin/approver. Hak akses dapat dikonfigurasi melalui sistem permission yang ada. Pengelola rak/model mendapat katalog terbatas (ID, tag, nama, tipe, status) tanpa membuka seluruh data aset. Perubahan API mengikuti audit trail aplikasi.

Validasi: `node --test test/assetManagementService.test.js`, `npm run build:client`. Pengujian elevasi/foto: `node --test test/assetRackPhotos.test.js`; browser dengan data contoh terisolasi: `npm run test:asset-rack-browser`. Screenshot hasil browser tersedia di `output/asset-rack-glpi-preview.png`.

## Pengaturan email renewal

Di Asset Register, buka tab Pengaturan Email / SMTP. Ubah pengaturan melalui modal untuk memilih akun SMTP terpusat serta subjek dan isi pesan. Placeholder yang didukung: {{tag}}, {{name}}, {{owner}}, {{ownerEmail}}, {{service}}, {{renewalDate}}, {{vendor}}, {{model}}, {{location}}. Pengaturan berlaku bagi semua reminder renewal aset; penerima, tanggal renewal, dan H- tetap mengikuti setiap aset. File koneksi dan kredensial dikelola melalui Pengaturan SMTP terpusat. Tombol + Pasang perangkat berada di toolbar atas Rak Server.

## Kanvas modelling interaktif

Seret aset dari katalog Asset Register ke kanvas dan konfirmasikan penambahan melalui modal. Seret kartu untuk mengatur posisi dengan snap grid 10 px; garis relasi mengikuti posisi kartu. Gunakan ikon Pilih untuk memindahkan kartu. Gunakan ikon Hubungkan dan klik kartu sumber lalu tujuan, atau seret titik koneksi ke kartu tujuan untuk membuka modal jenis relasi. Sumber dan tujuan ditentukan dari kanvas, tanpa input manual. Gunakan zoom dan scroll untuk menjelajahi kanvas, atau Susun otomatis untuk merapikan kartu. Simpan diagram melalui modal agar posisi tersimpan di server. Konflik versi ditolak untuk mencegah menimpa perubahan pengguna lain; Muat ulang diagram mengembalikan versi server melalui konfirmasi. Penambahan relasi tetap dicatat melalui API relasi dan audit trail.

## Assessment risiko CIA aset

Modal Tambah/Ubah aset menyediakan Confidentiality, Integrity, Availability dan kemungkinan kejadian pada skala 1-5 (sangat rendah hingga sangat tinggi; kemungkinan sangat jarang hingga sangat sering). Dampak diambil dari nilai CIA tertinggi; skor risiko = dampak x kemungkinan. Matriks 5x5 memakai Low untuk skor 1-4, Medium untuk 5-12, High untuk 15-25. Hasil dihitung otomatis di modal dan dihitung ulang di backend saat disimpan. Assessment terpisah dari kritikalitas operasional. Aset lama tanpa assessment ditandai Belum dinilai; isi assessment saat mengedit aset.

## Related risk

Kolom Related risk berada di samping Risiko CIA. Pilih risk membuka modal multi-select dari Risk Register dengan pencarian, filter kategori/rating/treatment dan pagination 20 risiko. Pilihan disimpan terpisah dari data CIA, melalui relasi dengan foreign key ke risk_register. Lihat related risk membuka detail risiko terpilih; jumlah per rating ditampilkan seperti TPRM. Hak akses membutuhkan baca Asset Register dan Risk Register, serta update Asset Register untuk mengubah pilihan. Risiko yang dihapus otomatis dilepas dari aset.

## Vendor pengelola opsional

Modal Tambah/Ubah aset menyediakan Vendor pengelola TPRM (opsional), diambil dari TPRM Risk Register bersama layanan dan status hubungan. Pilihan Tidak dikelola vendor menyimpan nilai kosong. Field Vendor perangkat tetap menjadi informasi produsen/vendor perangkat. Vendor pengelola tampil dalam kolom tersendiri di daftar aset. Pemilihan baru memerlukan baca TPRM; link lama dapat dipertahankan saat mengedit aset. Backend memvalidasi referensi sebelum menyimpan. Daftar aset memakai baris dan tombol yang ringkas.

## Uploaded Files dan backup

Foto depan/belakang aset dan foto rak otomatis tercatat di Uploaded Files dalam folder `Asset Management/assets` atau `Asset Management/racks`. Foto lama didaftarkan saat server dimulai. Hak akses daftar mengikuti aturan Uploaded Files: admin melihat seluruh file, pengguna melihat unggahannya sendiri; foto lama tanpa identitas pengunggah dikelola admin. Penggantian/penghapusan foto dari modal tetap menyimpan unggahan sebelumnya di library untuk pengelolaan. Penghapusan dari Uploaded Files melepaskan gambar terkait, tanpa menghapus aset atau rak.

Backup database penuh mencakup seluruh tabel aset, penempatan rak, relasi, layout diagram, penilaian CIA, Related risk, vendor pengelola, pengaturan reminder, dan byte asli foto. File Backup ZIP juga mencakup foto tersebut, termasuk pemilihan folder Asset Management. Restore ZIP memperbarui gambar yang masih terhubung dan mempertahankan salinan biner di database. Untuk pemulihan lengkap lintas instalasi, restore database dahulu lalu file ZIP untuk file modul lain yang tersimpan di storage eksternal. ZIP file saja tidak memulihkan record aset/rak.

Gambar Knowledge Notes juga masuk Uploaded Files pada folder `Knowledge Notes`, termasuk gambar yang diimpor bersama catatan. File dokumen/evidence dari modul lainnya tetap memakai daftar pusat yang sama. Jalankan `node scripts/test-uploaded-images-backup.js` untuk uji database nyata: unggahan aset/rak/catatan, pemilik, ZIP restore, serta hapus library; record pengujian di-rollback.

Uploaded Files berlaku untuk seluruh modul, termasuk dokumen TPRM, Policy Register, NIST CSF/Privacy, ISO/SOA, Audit, Knowledge Notes, dan aset/rak. Kolom Modul / Assessment menampilkan asal unggahan. File asli MD/TXT/JSON pada impor Knowledge baru disimpan atomik bersama hasil catatan; impor folder tetap mengabaikan file konfigurasi. Byte asli impor catatan lama tidak tersedia untuk direkonstruksi secara persis. Jalankan `node scripts/test-all-module-uploads.js` untuk memeriksa unggahan API terautentikasi lintas modul, daftar pusat, dan byte asli Knowledge; data pengujian dibersihkan.
