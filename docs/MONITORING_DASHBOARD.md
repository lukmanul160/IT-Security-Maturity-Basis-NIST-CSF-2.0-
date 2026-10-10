# Monitoring Dashboard

Menu berada di atas **Assessment map**. Dashboard membaca ringkasan dari database dan layanan aplikasi melalui `GET /api/monitoring-dashboard`. Halaman mengikuti tema workspace dan bahasa Indonesia/Inggris.

## Isi dan grafik

- Assessment NIST CSF/Privacy: kontrol yang dinilai lengkap pada kedua sisi policy/practice, maturity rata-rata, dan skala assessment. Nilai nol CSF tetap dianggap penilaian yang valid.
- ISO 27001/SOA: implementasi yang dicatat, evidence, applicability, serta sasaran keamanan tahun berjalan. Pencatatan implementasi bukan bukti sertifikasi atau kepatuhan.
- Risk Management/Risk Acceptance: distribusi rating atau keputusan dan tanggal deadline/remediasi.
- Audit Finding: status temuan, jumlah audit/tindak lanjut, dan due date temuan yang belum Closed.
- Threat Modelling: jumlah diagram, ancaman STRIDE, serta status ancaman.
- Policy Register: approval status dan next review berdasarkan Annual/Biannual/Quarterly, mengikuti perhitungan reminder yang sudah ada.
- Asset Register: lifecycle, risiko CIA tinggi, dan renewal aset yang belum retired/disposed.
- Rak Server: kapasitas U unik terpakai/tersedia dan perangkat terpasang. Perangkat yang memakai dua sisi tidak dihitung dua kali pada kapasitas U fisik.
- Modelling Asset Register: jenis relasi dan jumlah canvas, termasuk Kanvas utama.
- Personnel Certification: jumlah personel, status sertifikasi, dan expiry.
- TPRM: risk tier, vendor aktif, next review, questionnaire, dan template. Framework/tiering berupa panduan, sehingga ditandai sebagai referensi tanpa grafik transaksi buatan.
- Knowledge Notes: jumlah catatan dan distribusi folder utama.
- Uploaded files: distribusi sumber file; pengguna non-admin hanya melihat ringkasan file miliknya sesuai akses evidence yang sudah ada.
- Admin: akun berdasarkan role, event audit 30 hari, database/file backup, serta konfigurasi SMTP/storage. Secret, kredensial, dan isi audit event tidak dikirim ke dashboard.

Grafik distribusi dapat diganti antara donat dan batang. Distribusi yang memiliki lebih dari enam kategori menggabungkan kategori tersisa sebagai **Lainnya**. Tren enam bulan menghitung record yang memiliki `created_at`, bukan riwayat perubahan rating. Tenggat dihitung menggunakan tanggal **Asia/Bangkok**, termasuk hari ini sampai 30 hari ke depan; tanggal sebelum hari ini masuk lewat tenggat.

## Akses dan pembaruan

Permission baru: `monitoring-dashboard` / Read, dengan akses baca default untuk role yang valid. Setiap ringkasan tetap diperiksa terhadap Read modul sumber di server. Administrasi hanya untuk admin. Menonaktifkan Read sebuah modul juga menghilangkan ringkasannya dan mencegah query data modul tersebut.

Response menggunakan `Cache-Control: private, no-store`. Maksimal empat pembacaan modul berjalan bersamaan. Kegagalan satu modul ditandai **Belum tersedia**, tanpa mengarang nilai nol atau menghilangkan modul lain. Tombol muat ulang tersedia; auto-refresh 60 detik bersifat opsional dan hanya berjalan saat dashboard aktif serta tab browser terlihat.

Dashboard merupakan monitoring data aplikasi. Pemakaian rak bukan telemetry perangkat; konfigurasi SMTP bukan bukti keberhasilan pengiriman; daftar backup bukan bukti bahwa restore telah diuji.

## Validasi

```powershell
node --test test/monitoringDashboard.test.js
npm run test:monitoring-browser
npm run test:monitoring-workspace
npm test
npm run build
```

Unit/API tests memeriksa akses modul, ownership file, batas tanggal Bangkok, tren bulanan, kegagalan parsial, dan response tanpa cache. Browser sintetis memeriksa grafik, filter, bahasa, empty state, navigasi, refresh, serta mobile tanpa overflow. Browser workspace memakai sesi pengujian lokal dan API read-only untuk memeriksa posisi sidebar, pemulihan halaman, navigasi, dan seluruh ringkasan yang diizinkan.
