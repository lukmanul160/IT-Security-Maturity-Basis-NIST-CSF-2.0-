# Perbaikan temuan OWASP — 3 Oktober 2026

Empat temuan pada OWASP-REVIEW-2026-10-03.md telah ditangani di kode. Perubahan frontend, skema data, dan format evidence tidak diperlukan.

## Perilaku yang dipertahankan

Endpoint, role, format upload, batas individual file, dan format backup tetap sama. Perubahan nama profil tidak ikut dibatasi oleh limiter password. Endpoint deklarasi audit /api/audit/activity tetap mengembalikan kegagalan database secara eksplisit agar alur import/export yang ada tidak mengklaim pencatatan berhasil ketika database belum menerima event.

## Perubahan keamanan

- Restore database mencabut seluruh sesi sejak restore dimulai, menolak login/sesi baru selama restore, dan mencabut sesi lagi sebelum membuka autentikasi. Restore bersamaan ditolak. Pengguna wajib login ulang setelah restore, termasuk jika restore gagal. Validasi format/nama file sebelum restore tidak mencabut sesi. Pemeriksaan generation mencegah autentikasi yang sedang berjalan menggunakan hasil sebelum restore.
- Unggahan multipart pada API autentikasi utama dibatasi empat request aktif per proses, maksimum dua per akun; request tambahan menerima 429 dan Retry-After: 5. Kapasitas mencakup parsing dan pemrosesan sampai respons selesai. RAM parser yang sebelumnya bisa tumbuh melalui upload paralel kini memiliki batas concurrency. memoryStorage untuk audit finding/replacement tetap dipertahankan agar service yang menerima buffer tetap kompatibel.
- Total file batch 200 MiB kini dihitung selama streaming ke disk, sehingga file berlebih tidak menunggu seluruh batch diterima. File sementara dibersihkan saat gagal. File pengganti diverifikasi kepemilikannya sebelum multipart diproses; controller tetap memverifikasi kembali sebelum penulisan.
- Verifikasi password pada PUT /api/auth/me dan PUT /api/auth/me/password memakai budget bersama: sepuluh request per akun dan tiga puluh per IP dalam lima belas menit. Input currentPassword di atas 72 byte ditolak sebelum bcrypt. Operasi profil tanpa field password tetap berjalan.
- Audit otomatis yang gagal masuk database ditulis ke data/audit-pending dengan nama acak, write+sync dan rename atomik. Worker mencoba ulang setiap tiga puluh detik dan saat startup; maksimal seratus event setiap putaran. File hanya dihapus setelah database berhasil menerima event. Redaksi kredensial tetap dilakukan sebelum event masuk cadangan. Metadata auditCapturedAt mempertahankan waktu pencatatan asal saat replay menggunakan waktu INSERT yang lebih baru.

## Operasional

Perubahan berlaku setelah proses backend memuat kode baru. Proses aktif tidak direstart otomatis agar pekerjaan pengguna tidak terputus. Tidak menjalankan restore database nyata atau mengubah data produksi saat pengujian.

Folder data/audit-pending harus bisa ditulis akun server dan dilindungi ACL khusus akun server pada Windows. Di POSIX folder dibuat mode 0700 dan file mode 0600. Folder dikecualikan dari Git. Pesan [audit-recovery] pada log server menandai kegagalan database/retry dan perlu diteruskan ke pemantauan operasional yang digunakan deployment.

Antrian dibatasi seribu file dengan maksimum 128 KiB per event untuk membatasi disk. Jika disk penuh, antrian penuh, atau event melebihi batas, kegagalan cadangan dicatat secara eksplisit di log; operasi yang sudah selesai tidak dibatalkan. Proses yang mati sebelum audit asynchronous tersimpan masih bisa kehilangan event. Retry memberikan jaminan at-least-once: crash setelah INSERT sebelum penghapusan file dapat menyebabkan duplikasi audit. Penanganan exactly-once memerlukan perubahan skema terpisah.

Limiter, kapasitas upload, dan sesi menggunakan memori per proses sesuai arsitektur existing. Deployment banyak proses membutuhkan shared session/limiter dan invalidasi restore lintas proses. Request yang sudah melewati autentikasi sebelum restore dimulai tidak dibatalkan; lakukan restore saat aktivitas aplikasi berhenti.

## Validasi

Hasil akhir `npm.cmd test`: 109 tes, 104 lulus, 5 tes integrasi database dilewati sesuai konfigurasi suite, dan 0 gagal. Pemeriksaan sintaks modul baru serta `git diff --check` lulus.

Tes regresi mencakup restore sukses/gagal, invalidasi sesi, limiter bersama kedua endpoint password, profil biasa, kepemilikan sebelum parsing, batas streaming batch, cleanup dan upload berikutnya, kapasitas upload, serta recovery audit setelah instance dibuat ulang. Suite npm test juga memasukkan tes keamanan baru.

Saran penguatan tambahan pada laporan awal (CSP workspace, validasi magic bytes/malware, konfigurasi HTTPS/CSRF/deployment) tetap memerlukan evaluasi kompatibilitas tersendiri; tidak diklaim sebagai eksploit terkonfirmasi atau perbaikan dalam perubahan ini.
