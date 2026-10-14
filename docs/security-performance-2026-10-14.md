# Audit keamanan dan performa — 14 Oktober 2026

Cakupan: review kode autentikasi, izin API, upload/storage, proses Excel CSF/Privacy/IKAS, query dashboard, tampilan error frontend, Docker, dan dependency yang terpasang. Ini adalah audit terarah dan perbaikan kode, bukan sertifikasi ASVS atau pentest menyeluruh atas deployment.

## Temuan dan tindakan

| Temuan | Penilaian | Tindakan / bukti |
| --- | --- | --- |
| Pesan bootstrap dimasukkan ke `innerHTML` | Medium: sink DOM XSS; exploit end-to-end dari sumber tidak tepercaya belum dibuktikan | Diganti dengan `createElement`/`textContent`. Browser menguji payload HTML/script dan memastikan hanya teks yang tampil, tidak ada elemen/script baru, serta tombol reload bekerja. |
| Parsing/penulisan Excel sinkron menahan event loop | Medium: pengguna dengan akses Excel bisa menyebabkan penurunan respons server | CSF/Privacy/IKAS memakai worker terpisah, 2 aktif, 4 antrean, batas waktu eksekusi 30 detik, batas old-generation heap 256 MB per worker. Antrean penuh ditolak 429; timeout/crash menghasilkan 503 dan kapasitas dilepas setelah worker dihentikan. |
| Dependency terpasang | Registry melaporkan 0 advisory, termasuk 0 critical/high | `output/security-audit-2026-10-14.json`. `npm run audit:security` menolak advisory high/critical. SheetJS 0.20.3 memakai distribusi resmi CDN dan integrity lockfile; hasil registry bukan cakupan lengkap paket eksternal atau bug logika. |
| Perlindungan rilis belum otomatis memeriksa image | Medium: CVE OS/image dapat berubah tanpa perubahan kode | `.github/workflows/security.yml` disiapkan untuk push, PR, manual, dan mingguan: audit npm, build, tes keamanan, scan Trivy image aplikasi dan PostgreSQL, gagal jika ada critical termasuk yang belum memiliki fix. Action dipatok ke commit SHA, token hanya read contents. Workflow belum dijalankan di GitHub pada audit ini. |

## Kontrol yang ditinjau

- Autentikasi API, cookie HttpOnly/SameSite, batas login, password bcrypt maksimal 72 byte, dan pencabutan sesi saat perubahan akun/restore: ada dan diuji oleh suite keamanan.
- Akses API per peran dan tindakan, serta evidence menurut pemilik: diuji melalui suite izin dan evidence. Identitas pemilik tidak berasal dari field multipart yang tidak dipercaya.
- Query yang ditinjau memakai parameter SQL; backup menggunakan `execFile` dengan argumen terpisah. Ini tidak menyatakan setiap query/interpolasi seluruh repository sudah diaudit.
- Upload memiliki batas per file/request dan kapasitas paralel. Parser workbook yang ditinjau memeriksa integritas ZIP dan batas total hasil dekompresi 64 MB. Worker memperkecil dampak CPU/heap pada proses HTTP.
- Evidence diberi sandbox response; header nosniff, anti-framing, referrer policy, dan Secure cookie pada HTTPS production sudah tersedia. Source map build dimatikan.
- Bundle workspace diberi gzip dan cache private immutable setelah autentikasi. Pagination/render halaman tersedia pada beberapa tabel; banyak endpoint masih memuat seluruh dataset.

## Pengukuran lokal

Skenario sintetis: tiga export menggunakan template asli; proses terpisah melakukan GET `/login` setiap 10 ms. Node v24.19.0 pada Windows, loopback. Tidak mengubah record bisnis. Sampel sebelum dan sesudah berbeda jumlah karena thread utama sebelum perbaikan tidak responsif selama pekerjaan Excel.

| Ukuran | Sinkron sebelum | Worker sesudah |
| --- | ---: | ---: |
| Waktu tiga pekerjaan | 2.137 ms | 2.341 ms |
| Jumlah probe HTTP | 7 | 74 |
| HTTP P95 | 772,6 ms | 23,4 ms |
| HTTP maksimum | 772,6 ms | 35,4 ms |
| Event loop maksimum | 770,2 ms | 32,6 ms |
| Peak RSS proses | 358,2 MB | 622,3 MB |

Perbaikan menjaga respons HTTP saat pekerjaan Excel berjalan; tidak mempercepat total pekerjaan pada pengukuran ini. Peak RSS mencakup thread worker dan heap proses yang masih menahan alokasi baseline sebelumnya. Batas heap worker bukan batas RSS total atau buffer eksternal. Tetapkan anggaran RAM/container berdasarkan pengukuran deployment sebelum menaikkan konkurensi. Angka ini bukan SLO produksi atau uji ribuan pengguna. Bukti: `output/security-performance-2026-10-14.json`, dapat diulang lewat `npm run assess:performance`.

Bundle utama sekitar 1,32 MB sebelum gzip dan 329 KB dengan gzip level 4 saat pengukuran. Ini masih merupakan risiko waktu parse/eksekusi pada perangkat lemah; pemecahan modul legacy dan pengurangan DOM memerlukan pekerjaan lanjutan, tidak ditutupi klaim bahwa performa semua perangkat sudah terjamin.

## Risiko / verifikasi yang masih tersisa

1. Docker CLI tidak tersedia pada lingkungan audit. Image aplikasi, Node/Debian, serta PostgreSQL belum berhasil dipindai di sini. Status bebas CVE critical untuk deployment menunggu hasil job Trivy, bukan hanya hasil npm. Aktifkan pemeriksaan workflow sebagai required checks di branch/release; file workflow lokal saja belum melarang deploy manual.
2. Dependency audit memakai database advisory registry saat pengujian, bukan jaminan bebas kerentanan yang belum diketahui. Paket dari CDN, image OS, dan konfigurasi infrastruktur memiliki cakupan berbeda.
3. Sesi/rate-limit masih tersimpan per proses. Multi-instance memerlukan store bersama serta konfigurasi trusted proxy yang terbatas. Tidak ada konfigurasi proxy/HTTPS produksi yang diuji.
4. Kantor virtual sengaja menyediakan nama, peran, status online, dan aktivitas pada endpoint publik. Ini adalah keputusan paparan data yang harus sesuai kebutuhan deployment; tidak diubah diam-diam dalam audit ini.
5. Tidak ada pemindaian malware dokumen. Parsing Excel lainnya, pembuatan PDF, dan export besar di luar CSF/Privacy/IKAS masih perlu evaluasi beban tersendiri. Tidak semua proses berat telah dipindahkan ke worker.
6. CSP ketat global belum diterapkan: runtime legacy memasang script inline secara dinamis. Migrasi runtime dan pengujian CSP diperlukan; sandbox khusus evidence sudah ada.
7. Tidak dilakukan stress test database produksi, pemeriksaan seluruh `EXPLAIN ANALYZE`, cloud storage/SMTP nyata, DAST menyeluruh, atau audit rahasia atas seluruh riwayat Git. Volume data besar memerlukan pagination API dan pengukuran query per endpoint.

## Acuan OWASP dan Node.js

- [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs): dipakai sebagai kerangka cakupan autentikasi, sesi, akses, input, file, dan konfigurasi; bukan klaim semua requirement/level telah terpenuhi.
- [OWASP DOM based XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html): sink teks aman untuk data yang tidak dipercaya.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): otorisasi, batas ukuran, validasi, dan ukuran setelah dekompresi.
- [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html): batas request dan perlindungan resource.
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html): pemisahan pekerjaan JavaScript intensif CPU dari event loop HTTP.
- [Distribusi resmi SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/): sumber paket eksternal yang dipakai aplikasi.

Pemeriksaan: `npm run audit:security`, `npm run test:security`, `npm run test:security-browser`, `npm run test:maturity-excel`, `npm test`, dan `npm run build:client`. Untuk Windows PowerShell gunakan `npm.cmd`.

Hasil validasi akhir: suite aplikasi 326 tes (321 lulus, 5 dilewati, 0 gagal), suite keamanan 33 lulus, pengujian payload XSS browser lulus, build frontend lulus, dan audit dependency melaporkan 0 advisory. Lima tes yang dilewati tetap merupakan batas cakupan, bukan dianggap lulus. Integrasi assessment tahunan menguji route Excel yang kini menggunakan worker. Job scan Docker belum dijalankan.
