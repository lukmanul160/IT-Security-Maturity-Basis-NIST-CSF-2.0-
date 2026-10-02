# Database Backup

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
