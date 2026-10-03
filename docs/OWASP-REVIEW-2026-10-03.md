# Pemeriksaan keamanan OWASP — 3 Oktober 2026

Referensi: [OWASP Top 10:2025](https://top10.owasp.org/2025/).

Lingkup: review kode backend Express, autentikasi, otorisasi, evidence, backup/restore, unggahan, audit, konfigurasi, dan sebagian rendering frontend. Pemeriksaan dilakukan pada working tree saat ini, termasuk perubahan lokal pengguna. Kode aplikasi tidak diubah. Tidak melakukan restore database nyata, serangan beban, atau pentest deployment.

## Temuan

### 1. Tinggi — sesi mempertahankan hak lama setelah restore database

Kategori: A01 Broken Access Control / A07 Authentication Failures.

Bukti: `src/services/backupService.js:98-112` mengembalikan sukses setelah restore tanpa mencabut sesi. `src/config/auth.js:31-38` menyimpan username dan role dalam Map; middleware autentikasi menggunakan snapshot tersebut tanpa memverifikasi role terbaru di database. Penurunan role dan perubahan password melalui accountService mencabut sesi, tetapi restore melewati jalur itu.

Validasi: restore JSON dijalankan dengan koneksi database mock dan file sementara. Snapshot memuat akun dengan role viewer, sementara sesi sebelum restore memiliki role admin. Hasil `getSession(token).role` setelah restore masih `admin`. Database nyata tidak disentuh.

Dampak: sesi yang seharusnya tidak lagi memiliki hak admin dapat terus memakai endpoint administratif hingga logout, login pengganti, restart, atau masa sesi delapan jam habis. Prasyarat: sesi sudah aktif dan administrator menjalankan restore yang mengubah akun/password/role. Temuan ini bukan akses restore oleh pengguna tanpa izin.

Perbaikan: cabut seluruh sesi setelah restore berhasil, wajibkan login ulang, dan pertimbangkan versi sesi yang diverifikasi terhadap database. Hindari akses bersamaan selama restore agar perubahan hak tidak mengalami race.

### 2. Sedang — unggahan dapat menghabiskan RAM atau ruang sementara

Kategori: A06 Insecure Design / A10 Mishandling of Exceptional Conditions.

Bukti: `src/routes/auditFindingRoutes.js:5` menggunakan memoryStorage dengan sepuluh file masing-masing 10 MiB, sekitar 100 MiB per request sebelum overhead. `src/controllers/fileController.js:40-49` menerima replacement hingga 50 MiB dalam RAM. Pada fileRoutes, pemeriksaan kepemilikan replacement dilakukan di controller setelah multipart selesai dibaca. Batas batch 200 MiB di `fileController.js:74` diperiksa setelah staging selesai; batas Multer memungkinkan hingga dua puluh file masing-masing 50 MiB.

Dampak: pengguna dengan izin terkait dapat mengirim request paralel dan menekan RAM atau disk sementara hingga layanan terganggu. Tidak ditemukan pembatas concurrency atau kuota upload pada kode aplikasi; reverse proxy mungkin memiliki kontrol tambahan yang belum diperiksa. Tidak dilakukan uji kehabisan sumber daya.

Perbaikan: gunakan streaming/staging disk dengan batas total yang diterapkan selama penerimaan, batasi concurrency dan kuota per akun, serta periksa kepemilikan sebelum memproses replacement. Terapkan batas request dan waktu baca pada reverse proxy.

### 3. Sedang — pemeriksaan password saat ini tidak dibatasi

Kategori: A07 Authentication Failures / A06 Insecure Design.

Bukti: `src/routes/authRoutes.js` memasang login limiter hanya pada POST /login. PUT /me/password menuju `src/services/accountService.js:49-57` dan menjalankan bcrypt.compare tanpa limiter. Jalur perubahan password admin melalui PUT /me juga membandingkan password tanpa limiter.

Dampak: pemegang sesi dapat mencoba password saat ini berulang kali; bcrypt juga menjadi pekerjaan CPU mahal yang bisa dipicu paralel. Untuk menebak password akun lain, penyerang perlu lebih dahulu memiliki sesi akun tersebut. Temuan tidak berarti endpoint ini dapat dipakai tanpa autentikasi.

Perbaikan: batasi percobaan per akun dan IP pada seluruh jalur verifikasi password; batasi concurrency bcrypt; catat dan beri alert pada kegagalan berulang. Batasi panjang input currentPassword sebelum bcrypt.

### 4. Sedang — kegagalan audit hanya masuk console tanpa mekanisme pemulihan

Kategori: A09 Security Logging and Alerting Failures.

Bukti: `src/middleware/audit.js:53` menangkap kegagalan INSERT audit dengan console.error. Dalam kode yang diperiksa tidak ditemukan retry, antrian persisten, atau alert khusus kegagalan penyimpanan audit. Audit dilakukan saat response selesai.

Dampak: jika penyimpanan audit gagal, operasi aplikasi yang sudah berhasil dapat kehilangan jejak audit di tabel. Log console mungkin dikumpulkan dan dipantau deployment; konfigurasi tersebut belum diverifikasi.

Perbaikan: sediakan antrian audit persisten atau pencatatan cadangan terstruktur beserta retry dan alert. Tetapkan perilaku operasi sensitif ketika audit tidak tersedia sesuai kebutuhan sistem.

## Penguatan tambahan, bukan eksploit yang terkonfirmasi

- Validasi unggahan normal hanya mencocokkan ekstensi dengan MIME dari klien (`fileService.js:53`). Tambahkan validasi isi/magic bytes dan pemindaian malware jika evidence akan dibuka pengguna. Download sudah diberi CSP sandbox; pemalsuan MIME saja tidak membuktikan XSS.
- Workspace belum diberi Content-Security-Policy global. Tambahkan kebijakan yang kompatibel dengan frontend untuk mengurangi dampak jika ada injection. Banyak rendering yang diperiksa sudah menggunakan escapeHtml; tidak ada XSS terkonfirmasi dari pemeriksaan terbatas ini.
- Origin guard melewatkan request tanpa Origin dan membandingkan host tanpa skema (`app.js:41-44`). Cookie SameSite=Lax memberikan perlindungan tambahan. Pertimbangkan token CSRF dan origin tepercaya lengkap; belum ada bypass CSRF browser yang dibuktikan.
- Vite mengaktifkan sourcemap dan file map berada di public. Static workspace membutuhkan autentikasi; ini bukan kebocoran publik tanpa login. Nonaktifkan distribusi map pada production bila tidak diperlukan.
- Cookie Secure bergantung pada NODE_ENV=production; server aplikasi memakai HTTP. Pastikan HTTPS reverse proxy, pembatasan akses port backend, dan TLS database untuk koneksi lintas jaringan. Kondisi deployment nyata belum diperiksa.

## Hasil verifikasi

- `node --test test/securityHardening.test.js test/evidenceAccessService.test.js test/personnelAuthorization.test.js test/userModuleAccess.test.js test/roleActionPermissions.test.js`: 16 tes, 14 lulus, 2 dilewati, 0 gagal. Pengujian integrasi kepemilikan uploader dan persistensi action permission dilewati oleh suite; hasil unit test tidak membuktikan seluruh otorisasi database nyata aman.
- `npm.cmd audit --json`: 0 advisory yang dilaporkan untuk dependency graph pada waktu pemeriksaan. Hasil ini tidak menjamin semua komponen aman; dependensi tarball SheetJS dan risiko supply chain tidak tercakup penuh oleh basis advisory npm.
- Kontrol positif yang ditemukan: SQL terparameterisasi pada jalur yang diperiksa, bcrypt, token sesi acak 32 byte, HttpOnly/SameSite cookie, pencabutan sesi pada perubahan akun melalui accountService, login rate limiter, validasi path, kepemilikan evidence, redaksi field sensitif audit, serta CSP sandbox untuk file download.

Prioritas: perbaiki invalidasi sesi restore terlebih dahulu, lalu batas sumber daya upload dan limiter verifikasi password. Temuan lain memerlukan verifikasi tambahan pada deployment dan integrasi database. Pemeriksaan ini bukan sertifikasi kepatuhan OWASP atau pentest menyeluruh.
