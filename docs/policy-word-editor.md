Policy Register menyediakan tombol **Edit dokumen** pada lampiran `.docx` pada semua status persetujuan bagi pengguna dengan izin update. Editor memakai toolbar Word yang sama dengan Surat Pernyataan. Dokumen `.doc` perlu dikonversi ke `.docx` terlebih dahulu.

Penyimpanan memerlukan izin tambah file dan akses ke file asli. Server memvalidasi DOCX, mengunci baris policy, lalu memeriksa ulang versi saat editor dibuka. Perubahan status, metadata, atau lampiran oleh pengguna lain menyebabkan konflik 409 dan mengharuskan editor dibuka ulang. Saat disimpan, status policy kembali ke **Draft** agar isi yang berubah dapat disetujui ulang. Dokumen hasil edit disimpan sebagai file baru dan referensi policy diperbarui; file asli tetap tersedia bagi referensi lain.

Verifikasi perubahan: unit test memakai fixture/mock tanpa mengubah data operasional; build frontend dijalankan. Uji Chrome dengan server fixture tanpa database memverifikasi toolbar SuperDoc dan isi DOCX tampil. Uji dokumen pengguna, integrasi database melalui browser, dan deployment belum dijalankan.

Akses **Edit dokumen** tersedia di kolom Actions, kolom lampiran, dan bagian Current attachment pada formulir Edit policy. Tombol Edit biasa membuka metadata policy. Editor memakai dialog modal agar tetap terlihat di atas formulir policy.

Jika muncul error `Hanya dokumen berstatus Draft yang dapat diedit.`, proses backend masih memuat versi lama. Restart proses Node setelah update (build frontend saja tidak memuat ulang service backend), lalu login ulang. Verifikasi lokal: restart server dan GET /login HTTP 200; regresi 371 lulus, 5 dilewati. Dokumen operasional pengguna belum diuji.

Batas editor DOCX default **50 MB** (1 MB = 1.048.576 byte). Admin dapat mengubah **Account ? Website Setting ? Batas ukuran file ? Edit dokumen Word (MB)**, antara 1?500 MB. Perubahan berlaku pada permintaan buka/simpan berikutnya tanpa restart dan juga berlaku pada unggah/edit template Surat Pernyataan. Batas ini terpisah dari upload umum. File `.doc` tetap harus dikonversi menjadi `.docx`. Validasi DOCX tetap membatasi 600 entri ZIP dan ukuran dekompresi aktual maksimum lima kali batas file; macro/konten aktif tetap ditolak. Batas export tetap berlaku ketika mengambil dokumen dari server.

Verifikasi ukuran: fixture DOCX tepat 50 MB diterima validator, 50 MB + 1 byte ditolak; perubahan batas upload editor diuji dengan HTTP dan konfigurasi mock. Pengujian ini belum membuktikan kelancaran mengetik/render dokumen 50 MB di browser atau deployment Docker/cloud.
