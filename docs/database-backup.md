# Database Backup

Sidebar **Backup System** mengelompokkan **Database Backup** dan **File Backup**.
File Backup khusus administrator menyediakan pembuatan, unduh, dan hapus arsip ZIP
di `backup/files`. Semua file yang terdaftar pada `evidence_files` dibaca melalui
storage aplikasi, termasuk lokasi lokal, shared storage, serta konten database lama.
ZIP menyimpan file dalam `upload/<path>` dan metadata dalam `manifest.json`.
Pilih **Folder untuk backup** untuk mencadangkan satu folder beserta subfolder,
atau **Semua folder**. Folder diambil dari path unggahan terdaftar, bukan folder
bebas di komputer host. Pada **Folder untuk restore**, pilih/ketik path folder
di dalam ZIP atau kosongkan untuk memulihkan semuanya. File di luar folder
pilihan tidak diubah; folder yang tidak ditemukan ditolak sebelum penulisan.
Backup baru juga dibatasi ZIP 500 MB, hasil ekstraksi total 2 GB (termasuk
manifest), 500 MB per file, 49.999 file, dan manifest 10 MB agar sesuai batas
restore. Jika batas terlampaui, arsip parsial dihapus; pilih folder yang lebih kecil.
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

Restore `.dump` memakai `--no-owner --no-acl`: objek yang dibuat menjadi milik
role database tujuan, dan GRANT/REVOKE dari instalasi asal tidak dipulihkan.
Ini memungkinkan pemindahan dari role `postgres`/`nist_app` ke `blackowl` pada
Docker tanpa harus membuat role asal. Hak database tambahan perlu diatur
kembali oleh DBA jika instalasi menggunakan beberapa role.

## Jika restore gagal pada Docker

Catat pesan error pada halaman restore, lalu periksa:

```text
docker compose --env-file .env.docker logs --tail 100 app db
docker compose --env-file .env.docker exec app pg_restore --version
```

- `role ... does not exist`: gunakan versi aplikasi yang sudah memakai
  `--no-owner --no-acl`, lalu rebuild image sesuai [panduan update](UPDATE_DOCKER.md).
- `unsupported version ... in file header` atau SQL yang tidak didukung:
  periksa versi PostgreSQL pembuat backup. Docker saat ini memakai PostgreSQL
  dan client tools 17; restore dari versi lebih baru ke server lebih lama tidak
  dijamin kompatibel. Jangan mengganti major image pada volume lama secara
  langsung; siapkan target yang kompatibel dan migrasi terencana.
- `Only valid NIST Basis ...`: gunakan nama asli backup aplikasi, berbentuk
  `nist-basis-YYYYMMDDTHHMMSSZ.dump` atau `.json`; file SQL/ZIP bukan Database Backup.
- `permission denied to set parameter session_replication_role`: snapshot JSON
  lama memerlukan hak yang sesuai; gunakan backup `.dump` jika tersedia.
- Setelah restore berhasil, login kembali menggunakan akun/password dalam
  backup; sesi sebelumnya berakhir dan password terbaru sebelum restore dapat
  berbeda dari password pada backup.

Simpan backup database tujuan sebelum mencoba restore ulang karena restore
mengganti objek/data yang tercakup dalam backup. Jangan menghapus volume untuk
memperbaiki restore. Pesan error diperlukan untuk menentukan langkah selanjutnya.

Cakupan adalah satu database aplikasi, bukan semua database pada server
PostgreSQL atau role global server. File evidence/upload, konfigurasi server,
dan kunci enkripsi SMTP berada di luar database dan perlu salinan terpisah.

Verifikasi 2 Oktober 2026: backup nyata dibandingkan dengan catalog database
aktif melalui `pg_restore --list`; seluruh 32 tabel dan 17 sequence tercakup.
Restore ke database aktif tidak dilakukan. Pengujian otomatis:
`node --test test/backupService.test.js`.

## Database besar (GB)

Pembuatan, unduhan, dan restore `.dump` tidak memiliki batas ukuran tetap di
aplikasi dan tidak mengikuti batas import/export Website Setting. Upload memakai
stream ke file sementara, unduhan memakai stream file, dan pg_dump/pg_restore
membaca/menulis file langsung, sehingga isi dump tidak dimuat seluruhnya ke RAM.
Server tidak memasang batas waktu total penerimaan request; batas header tetap aktif.
Snapshot JSON lama tetap maksimal 500 MiB karena diproses dalam memori.

Sediakan ruang di direktori sementara OS untuk seluruh dump unggahan, ruang backup
untuk arsip yang dibuat, serta ruang database/WAL yang cukup untuk restore. Pada
Docker, file sementara berada di writable layer container; untuk dump besar dapat
memasang volume disk khusus ke `/tmp`, jangan memakai tmpfs yang memakan RAM.
Pantau kapasitas disk dan tunggu proses selesai sebelum menutup halaman.

Jika memakai reverse proxy, sesuaikan batas body dan timeout di proxy juga.
Contoh Nginx untuk server aplikasi internal yang sudah dilindungi autentikasi:

```nginx
location /api/backups {
    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_read_timeout 24h;
    proxy_send_timeout 24h;
    client_body_timeout 24h;
    proxy_pass http://127.0.0.1:8000;
}
```

Sesuaikan upstream dengan deployment. Batas gateway/hosting di luar aplikasi tetap
berlaku. Ukuran maksimum praktis mengikuti disk, PostgreSQL, filesystem dan proxy.

## Split backup dan restore database

Pada Database Backup atur **Ambang pembagian backup**, default 500 MiB per bagian
(dapat diisi 1?10240 MiB). Dump yang tidak melebihi ambang tetap satu `.dump`.
Dump di atas ambang menjadi beberapa `.dump.part-0001`, `.dump.part-0002`, dan
satu `.manifest.json`. Seluruh bagian dan manifest tersedia di daftar backup.
Unduh semuanya dan simpan bersama, tanpa mengganti nama file.

Untuk restore, pilih **manifest dan semua bagian dari satu batch** sekaligus.
Urutan pemilihan bebas. Server memeriksa nama batch, jumlah bagian, ukuran, dan
SHA-256 tiap bagian serta dump gabungan sebelum menjalankan pg_restore. Jika
ada bagian hilang, duplikat, tercampur atau rusak, database tidak diubah.
Dump tunggal dan snapshot JSON lama masih dapat dipilih melalui form yang sama.

Pembagian dilakukan sesudah pg_dump berhasil membuat dump lengkap, bukan
sebagai pengganti backup yang gagal karena koneksi, izin atau disk penuh.
Sediakan ruang untuk dump penuh ditambah seluruh bagian selama split. Restore
memerlukan ruang temporary untuk seluruh unggahan dan dump yang digabung.
Semua bagian dipilih dalam satu upload multipart; batas body reverse proxy
harus cukup untuk ukuran total batch, bukan hanya satu bagian.

Pemilih restore mendukung multi-file melalui Ctrl/Shift dan penambahan bertahap.
Klik **Tambah file backup / bagian** berulang kali untuk menambahkan manifest
dan bagian tanpa menghapus pilihan sebelumnya. **Hapus dari pilihan** menghapus
satu item; **Kosongkan pilihan** menghapus seluruh daftar. Nama file yang sama
menggantikan pilihan lama sehingga tidak terkirim dua kali.
