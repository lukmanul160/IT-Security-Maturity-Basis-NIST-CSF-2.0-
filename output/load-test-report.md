# Hasil performance test — 16 Oktober 2026

Mulai: 2026-10-16T03:45:21.765Z. Node v24.19.0, 13th Gen Intel(R) Core(TM) i7-13620H, 16 logical CPU, RAM 15.7 GB, Windows.

## Metode dan batas hasil

- Instance Express terpisah pada loopback; generator beban berjalan di proses lain pada komputer yang sama. PostgreSQL lokal memakai data yang ada. Server utama tidak direstart.
- Empat endpoint GET; 1, 10, 25, 50, dan 100 koneksi simultan; masing-masing stage mengirim request selama 10 detik lalu menunggu request terakhir selesai. Throughput dihitung termasuk waktu penyelesaian tersebut.
- HTTP keep-alive, gzip, tanpa jeda antar-request. Tiga request pemanasan sebelum setiap stage. Satu sesi admin di memori untuk API privat; proses login/password hashing tidak diukur.
- Audit normal aktif sehingga catatan audit bertambah. Handler tetap menjalankan inisialisasi bawaan aplikasi. Tidak dilakukan operasi tambah/edit/hapus data bisnis atau pengiriman email.
- Ukuran data diperiksa saat pengujian: 2 aset, 70 risiko, 4 akun. Pemeriksaan terpisah terhadap dashboard menghasilkan HTTP 200 dan 28 modul ready, tanpa modul gagal.
- Ini uji singkat per endpoint, bukan uji browser, mixed traffic, soak test, atau kapasitas produksi. Koneksi simultan bukan jumlah pengguna manusia. Hasil dipengaruhi kompetisi CPU/disk/database pada host yang sama, urutan stage, dan pertumbuhan audit; bukan angka maksimum yang terjamin.
- p95 berarti 95% request selesai dalam waktu tersebut. Persentil mencakup semua hasil; error mencakup non-200 dan kegagalan jaringan. Timeout koneksi disetel 15 detik. HTTP 200 tidak menjamin seluruh modul dashboard ready: status isi respons tidak divalidasi pada setiap request beban. CPU diukur untuk proses aplikasi (100% setara satu core; dapat lebih tinggi karena thread), tidak termasuk PostgreSQL/generator. RSS hanya proses aplikasi. dbWaiting adalah snapshot setelah stage, bukan puncak antrean.

## Semua stage

| Endpoint | Koneksi | Request | Sukses/detik | p50 ms | p95 ms | p99 ms | Error % | RSS MB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| /login | 1 | 5898 | 589.8 | 1.5 | 2.6 | 5.6 | 0.00 | 225.3 |
| /login | 10 | 18794 | 1876.5 | 4.5 | 9.9 | 21.3 | 0.00 | 216.6 |
| /login | 25 | 5720 | 570.6 | 38.7 | 72.9 | 109.0 | 0.00 | 215.0 |
| /login | 50 | 7251 | 720.5 | 67.7 | 117.6 | 132.1 | 0.00 | 237.3 |
| /login | 100 | 4587 | 454.5 | 163.1 | 490.4 | 617.5 | 0.00 | 272.1 |
| /api/public/website-settings | 1 | 3159 | 315.8 | 2.7 | 4.6 | 8.6 | 0.00 | 279.7 |
| /api/public/website-settings | 10 | 4442 | 443.4 | 19.8 | 32.0 | 52.1 | 0.00 | 314.2 |
| /api/public/website-settings | 25 | 4373 | 435.8 | 51.4 | 99.8 | 146.6 | 0.00 | 314.5 |
| /api/public/website-settings | 50 | 4995 | 496.0 | 92.3 | 155.0 | 262.1 | 0.00 | 271.9 |
| /api/public/website-settings | 100 | 4187 | 413.6 | 233.5 | 354.7 | 392.2 | 0.00 | 272.4 |
| /api/asset-management/assets | 1 | 2122 | 212.1 | 4.2 | 6.8 | 14.1 | 0.00 | 274.9 |
| /api/asset-management/assets | 10 | 3229 | 322.1 | 27.8 | 43.1 | 88.9 | 0.00 | 276.2 |
| /api/asset-management/assets | 25 | 3906 | 388.8 | 60.9 | 90.7 | 123.6 | 0.00 | 312.7 |
| /api/asset-management/assets | 50 | 3544 | 350.7 | 126.9 | 231.6 | 343.3 | 0.00 | 313.9 |
| /api/asset-management/assets | 100 | 4331 | 418.2 | 233.9 | 340.4 | 394.4 | 0.00 | 310.7 |
| /api/monitoring-dashboard | 1 | 17 | 1.7 | 556.0 | 852.2 | 852.2 | 0.00 | 588.7 |
| /api/monitoring-dashboard | 10 | 36 | 3.0 | 2929.8 | 4153.3 | 4222.0 | 0.00 | 1134.5 |
| /api/monitoring-dashboard | 25 | 51 | 4.1 | 5837.2 | 6430.9 | 6507.0 | 0.00 | 1890.5 |
| /api/monitoring-dashboard | 50 | 67 | 4.6 | 10066.8 | 10481.5 | 11529.4 | 0.00 | 2874.8 |
| /api/monitoring-dashboard | 100 | 101 | 0.2 | 15310.0 | 15338.4 | 15339.8 | 97.03 | 4155.4 |

Total request terukur: 80810. Jumlah stage: 20/20.

## Temuan dan tindak lanjut

- Dashboard pada 100 koneksi: 98 dari 101 request gagal pada jaringan/timeout (97,03%); hanya 3 HTTP 200. Log aplikasi mencatat banyak Module unavailable pada beban ini, sehingga bahkan HTTP 200 dapat berisi hasil parsial. Pada akhir stage terdapat 398 peminjam menunggu pool database dan RSS proses aplikasi mencapai sekitar 4.155 MB. Ini kegagalan layanan pada konfigurasi uji, bukan kapasitas dashboard 100 koneksi yang sehat.
- Dashboard agregasi jauh lebih berat daripada halaman login dan API daftar. Kodenya membaca banyak modul setiap request, termasuk agregasi audit 30 hari, dengan maksimal 4 task paralel per request; pool PostgreSQL aplikasi dibatasi 10 koneksi.
- Kandidat perbaikan yang perlu diprofilkan: cache ringkasan dashboard dengan masa berlaku pendek sesuai hak akses, gabungkan refresh identik yang sedang berjalan, periksa query mahal dengan EXPLAIN ANALYZE, dan evaluasi agregasi audit serta pagination daftar. Penyebab dominan belum dibuktikan lewat profiling.
- Untuk penentuan kapasitas deployment: ulangi dengan generator di host lain, volume data representatif, beberapa sesi/role, campuran endpoint sesuai penggunaan, durasi lebih panjang, dan target latency/error yang disepakati.

## Menjalankan ulang

Prasyarat: dependency terpasang, konfigurasi .env valid, database/schema aplikasi sudah siap, dan terdapat akun admin. Perintah ini menambah audit pada database yang dikonfigurasi; gunakan database uji untuk pengulangan rutin.

```powershell
npm run test:load
node scripts/report-load-test.js
```

Opsional: atur LOAD_SECONDS dan LOAD_LEVELS melalui environment. Detail status HTTP, CPU, event loop, dan transfer tersedia di load-test-results.json. File hasil akan ditimpa saat dijalankan ulang.
