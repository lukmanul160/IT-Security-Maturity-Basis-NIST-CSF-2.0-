# Laporan pemeriksaan keamanan

Tanggal: 3 Oktober 2026. Pemeriksaan dilakukan pada workspace saat ini, yang sudah berisi perubahan sebelum audit. Ini adalah review kode dan dependensi, bukan sertifikasi bahwa aplikasi bebas dari semua kerentanan.

## Temuan yang diperbaiki

- Audit awal npm: 11 paket terdampak (8 high, 3 moderate), termasuk temuan turunan. Audit setelah pembaruan: 0 advisory pada dependensi produksi dan pengembangan yang terpasang. Bukti JSON tersedia di `output/security-audit-before.json` dan `output/security-audit-after.json`.
- Multer 2.4.0, Nodemailer 10.0.13, Vite 7.3.6, dan yauzl 3.4.0 dipasang; batas versi minimum dinaikkan dan lockfile diperbarui. CLI Tailwind dipatok ke 4.3.0 mengikuti solusi audit; paket watcher yang terpasang kini 2.6.0.
- SheetJS npm 0.18.5 diganti dengan 0.20.3 dari CDN resmi. Sumber distribusi: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/. Pembacaan dan penulisan workbook diuji melalui roundtrip dalam memori.
- Dependensi gaxios pada Google Cloud menggunakan override uuid ^11.1.1. gaxios yang terpasang memakai API v4 yang tetap tersedia; pemuatan modul Google Cloud berhasil. Operasi bucket nyata belum diuji.
- Sesi akun sebelumnya tetap berlaku setelah akun dihapus, peran diganti, atau password diubah. Semua sesi akun terkait kini dicabut setelah perubahan database berhasil. Penggantian password juga mengharuskan pengguna login kembali.
- Batas login per IP mencakup username bergantian dan login berhasil, dengan batas jumlah peer tersimpan dan masa kedaluwarsa. Penyimpanan percobaan gagal per username juga dibatasi dan dibersihkan.
- Password dibatasi hingga 72 byte UTF-8 untuk mencegah pemotongan diam-diam oleh bcrypt terhadap password multibyte. Input login yang terlalu panjang ditolak sebelum query/hash.
- Respons berkas evidence memakai CSP sandbox untuk membatasi konten aktif pada origin aplikasi, termasuk MIME yang dipalsukan. Ini tidak memindai malware di dokumen.
- Skrip `fix-template-db.js` kini memverifikasi sertifikat TLS secara default dan mendukung CA konfigurasi, konsisten dengan koneksi database utama.
- Sesi kedaluwarsa dibersihkan ketika sesi baru dibuat.
- Upload ditampung dalam folder sementara tetap, sehingga field multipart tidak menentukan direktori staging. File sementara dibersihkan juga saat validasi metadata atau pencarian pemilik gagal.

## Cakupan dan validasi

Review meninjau autentikasi, manajemen akun, middleware izin, rute administratif, akses evidence, validasi path storage, proses backup/restore, penggunaan SQL dinamis, pemanggilan proses, SMTP, dan pola HTML dinamis frontend. Review frontend bersifat terarah; setiap interpolasi DOM belum dibuktikan aman secara menyeluruh.

Suite utama: 73 lulus, 5 dilewati. Suite setup administrator: 3 lulus. Suite keamanan: 7 lulus, mencakup pencabutan sesi, pembatasan login, batas byte password, sandbox respons unggahan, dan cleanup upload gagal. Build CSS dan Vue produksi berhasil; ada peringatan ukuran bundle serta CSS yang diselesaikan saat runtime.

## Batas pemeriksaan dan risiko yang masih perlu divalidasi

- Lima tes integrasi database tidak dijalankan karena pengujian integrasi tidak diaktifkan. Enforcement izin dan isolasi evidence terhadap database nyata belum diverifikasi dalam audit ini.
- Tidak dilakukan pentest deployment, tes browser lengkap, uji beban upload paralel, pemeriksaan konfigurasi proxy/HTTPS, maupun akses S3/GCS/SMTP nyata. Tes menggunakan mock dan storage sementara ketika tersedia.
- Sesi dan pembatas login bersifat in-memory per proses. Pada deployment multi-worker/multi-instance, gunakan session/rate-limit store bersama dan konfigurasi trusted proxy secara terbatas. Jangan mempercayai X-Forwarded-For dari sembarang peer.
- Pencabutan sesi mencakup perubahan akun melalui service aplikasi dalam proses yang sama. Perubahan langsung di database, restore database, dan proses server lain tidak otomatis mencabut sesi proses ini.
- Upload menggunakan metadata MIME/ekstensi, belum pemeriksaan signature/malware. Pembatas ukuran per request bukan jaminan terhadap kehabisan disk/memori melalui banyak request paralel.
- Source map frontend masih dihasilkan dan bisa diakses pengguna terautentikasi. Log runtime sudah ada dalam file tracked sebelum review; isi log dan riwayat Git belum diaudit menyeluruh untuk kebocoran rahasia.
- Nol advisory npm hanya berarti tidak ada advisory yang dilaporkan registry untuk lockfile saat pemeriksaan. Itu tidak mencakup seluruh kelemahan logika aplikasi, dependency eksternal dari CDN, sistem operasi, PostgreSQL, atau kerentanan yang belum diketahui.

Pemeriksaan berulang: `npm ci`, `npm audit`, `npm test`, `npm run test:security`, `npm run test:admin-setup`, dan `npm run build`. Pada PowerShell dengan pembatasan script, gunakan `npm.cmd`.
