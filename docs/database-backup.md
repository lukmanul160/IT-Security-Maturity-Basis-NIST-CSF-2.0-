# Database Backup

Sidebar **Backup System** mengelompokkan **Database Backup** dan **File Backup**.
File Backup khusus administrator menyediakan pembuatan, unduh, dan hapus arsip ZIP
di `backup/files`. Semua file yang terdaftar pada `evidence_files` dibaca melalui
storage aplikasi, termasuk lokasi lokal, shared storage, serta konten database lama.
ZIP menyimpan file dalam `upload/<path>` dan metadata dalam `manifest.json`.
Jika satu file tidak bisa dibaca, pembuatan gagal dan arsip parsial dihapus.
File Backup menyediakan restore ZIP (unggahan maksimal 500 MB, hasil ekstraksi
maksimal 2 GB). Semua entri dan manifest divalidasi sebelum penulisan. File dipulihkan
ke storage aktif dengan path asli, nama, tipe, pemilik yang masih terdaftar, dan halaman PDF.
File dengan path sama diganti; file lain tidak dihapus. Jika penulisan storage gagal
di tengah proses, pesan menunjukkan jumlah file yang sudah dipulihkan; restore
dapat diulang setelah masalah diperbaiki. Pulihkan Database Backup terlebih dahulu
jika referensi lampiran juga perlu dipulihkan. Konfigurasi server dan kunci SMTP
tetap perlu salinan terpisah.

Backup baru selalu memakai `pg_dump --format=custom` untuk database yang
dikonfigurasi melalui `DATABASE_URL` atau `DB_*`. Tidak ada pembatasan schema
atau tabel: semua modul, termasuk tabel baru, dicadangkan otomatis bersama
struktur, data, sequence, view, fungsi, index, dan constraint database.

Pada Windows, aplikasi mencari client tools di folder PostgreSQL dalam
Program Files. `PG_DUMP_PATH` dan `PG_RESTORE_PATH` dapat digunakan untuk
menentukan executable. Jika pg_dump tidak tersedia, pembuatan backup gagal
dengan pesan konfigurasi; aplikasi tidak lagi membuat snapshot JSON parsial.
Restore dump memakai satu transaksi agar kegagalan tidak meninggalkan hasil
restore setengah selesai. Restore JSON lama tetap tersedia untuk kompatibilitas
dan hanya memulihkan data tabel pada schema yang sudah tersedia.

Cakupan adalah satu database aplikasi, bukan semua database pada server
PostgreSQL atau role global server. File evidence/upload, konfigurasi server,
dan kunci enkripsi SMTP berada di luar database dan perlu salinan terpisah.

Verifikasi 2 Oktober 2026: backup nyata dibandingkan dengan catalog database
aktif melalui `pg_restore --list`; seluruh 32 tabel dan 17 sequence tercakup.
Restore ke database aktif tidak dilakukan. Pengujian otomatis:
`node --test test/backupService.test.js`.
