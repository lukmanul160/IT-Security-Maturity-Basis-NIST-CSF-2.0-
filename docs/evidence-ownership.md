# Hak pilih evidence berdasarkan pengunggah

Semua pemilih **Select uploaded evidence** pada CSF, Privacy, ISO 27001 dan SOA memakai daftar server yang sama, bukan menyalin daftar lampiran pada assessment bersama. File Policy Register ikut tersedia pada daftar ini, sesuai pengunggahnya. Modul tanpa pemilih evidence tidak ditambahkan layout baru.

- Pengguna non-admin hanya mendapat file dengan `evidence_files.uploaded_by` sesuai ID akunnya.
- Admin dapat memilih semua file, termasuk file lama tanpa catatan pengunggah.
- ID pengunggah ditetapkan dari sesi server, bukan dari form. Nama file sama milik dua pengguna disimpan terpisah.
- Penggantian isi file mempertahankan ID pengunggah awal.
- API daftar, download, replace, delete, dan penambahan referensi evidence memeriksa hak akses. Referensi lama pada data bersama tetap dipertahankan saat menyimpan, tetapi tidak menjadi opsi untuk dipilih pada kontrol lain.
- File lama tidak diberikan kepada pengguna secara otomatis karena pemiliknya tidak dapat dipastikan. Admin tetap dapat mengaksesnya. Pengguna dapat mengunggah salinan sendiri jika diperlukan.

Migration: `database/evidence-ownership.sql`, dijalankan saat startup setelah schema utama. Kolom pemilik mengacu pada ID user dan menjadi NULL jika akun dihapus. API `/api/files?details=true` menyediakan metadata file yang boleh dipilih; `/api/files` mempertahankan format array path dengan pembatasan yang sama.

Audit Finding Tracker menyimpan unggahan evidence mandiri dalam tabel terpisah dan saat ini tidak mempunyai pemilih **Select uploaded evidence**. Perubahan ini berlaku pada pustaka uploaded evidence dan seluruh pemilih yang sudah memakai pustaka tersebut.

Verifikasi PostgreSQL terisolasi: set `RUN_EVIDENCE_DB_TESTS=1`, lalu jalankan `node --test test/evidenceAccessService.test.js`. Tes menggunakan tabel TEMP dan file sementara; tidak mengambil alih kepemilikan file existing.
