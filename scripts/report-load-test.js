const fs = require('node:fs');
const report = JSON.parse(fs.readFileSync('output/load-test-results.json', 'utf8'));
const rows = report.results;
const lines = [
  '# Hasil performance test — 16 Oktober 2026', '',
  `Mulai: ${report.startedAt}. Node ${report.node}, ${report.host.cpu}, ${report.host.logicalCpus} logical CPU, RAM ${report.host.ramGB.toFixed(1)} GB, Windows.`, '',
  '## Metode dan batas hasil', '',
  '- Instance Express terpisah pada loopback; generator beban berjalan di proses lain pada komputer yang sama. PostgreSQL lokal memakai data yang ada. Server utama tidak direstart.',
  '- Empat endpoint GET; 1, 10, 25, 50, dan 100 koneksi simultan; masing-masing stage mengirim request selama 10 detik lalu menunggu request terakhir selesai. Throughput dihitung termasuk waktu penyelesaian tersebut.',
  '- HTTP keep-alive, gzip, tanpa jeda antar-request. Tiga request pemanasan sebelum setiap stage. Satu sesi admin di memori untuk API privat; proses login/password hashing tidak diukur.',
  '- Audit normal aktif sehingga catatan audit bertambah. Handler tetap menjalankan inisialisasi bawaan aplikasi. Tidak dilakukan operasi tambah/edit/hapus data bisnis atau pengiriman email.',
  '- Ukuran data diperiksa saat pengujian: 2 aset, 70 risiko, 4 akun. Pemeriksaan terpisah terhadap dashboard menghasilkan HTTP 200 dan 28 modul ready, tanpa modul gagal.',
  '- Ini uji singkat per endpoint, bukan uji browser, mixed traffic, soak test, atau kapasitas produksi. Koneksi simultan bukan jumlah pengguna manusia. Hasil dipengaruhi kompetisi CPU/disk/database pada host yang sama, urutan stage, dan pertumbuhan audit; bukan angka maksimum yang terjamin.',
  '- p95 berarti 95% request selesai dalam waktu tersebut. Persentil mencakup semua hasil; error mencakup non-200 dan kegagalan jaringan. Timeout koneksi disetel 15 detik. HTTP 200 tidak menjamin seluruh modul dashboard ready: status isi respons tidak divalidasi pada setiap request beban. CPU diukur untuk proses aplikasi (100% setara satu core; dapat lebih tinggi karena thread), tidak termasuk PostgreSQL/generator. RSS hanya proses aplikasi. dbWaiting adalah snapshot setelah stage, bukan puncak antrean.', '',
  '## Semua stage', '',
  '| Endpoint | Koneksi | Request | Sukses/detik | p50 ms | p95 ms | p99 ms | Error % | RSS MB |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...rows.map(r => `| ${r.path} | ${r.concurrency} | ${r.requests} | ${r.successfulRps.toFixed(1)} | ${r.p50Ms.toFixed(1)} | ${r.p95Ms.toFixed(1)} | ${r.p99Ms.toFixed(1)} | ${r.errorPercent.toFixed(2)} | ${r.peakRssMB.toFixed(1)} |`), '',
  `Total request terukur: ${rows.reduce((n, r) => n + r.requests, 0)}. Jumlah stage: ${rows.length}/20.`, '',
  '## Temuan dan tindak lanjut', '',
  '- Dashboard pada 100 koneksi: 98 dari 101 request gagal pada jaringan/timeout (97,03%); hanya 3 HTTP 200. Log aplikasi mencatat banyak Module unavailable pada beban ini, sehingga bahkan HTTP 200 dapat berisi hasil parsial. Pada akhir stage terdapat 398 peminjam menunggu pool database dan RSS proses aplikasi mencapai sekitar 4.155 MB. Ini kegagalan layanan pada konfigurasi uji, bukan kapasitas dashboard 100 koneksi yang sehat.',
  '- Dashboard agregasi jauh lebih berat daripada halaman login dan API daftar. Kodenya membaca banyak modul setiap request, termasuk agregasi audit 30 hari, dengan maksimal 4 task paralel per request; pool PostgreSQL aplikasi dibatasi 10 koneksi.',
  '- Kandidat perbaikan yang perlu diprofilkan: cache ringkasan dashboard dengan masa berlaku pendek sesuai hak akses, gabungkan refresh identik yang sedang berjalan, periksa query mahal dengan EXPLAIN ANALYZE, dan evaluasi agregasi audit serta pagination daftar. Penyebab dominan belum dibuktikan lewat profiling.',
  '- Untuk penentuan kapasitas deployment: ulangi dengan generator di host lain, volume data representatif, beberapa sesi/role, campuran endpoint sesuai penggunaan, durasi lebih panjang, dan target latency/error yang disepakati.', '',
  '## Menjalankan ulang', '',
  'Prasyarat: dependency terpasang, konfigurasi .env valid, database/schema aplikasi sudah siap, dan terdapat akun admin. Perintah ini menambah audit pada database yang dikonfigurasi; gunakan database uji untuk pengulangan rutin.', '',
  '```powershell',
  'npm run test:load',
  'node scripts/report-load-test.js',
  '```', '',
  'Opsional: atur LOAD_SECONDS dan LOAD_LEVELS melalui environment. Detail status HTTP, CPU, event loop, dan transfer tersedia di load-test-results.json. File hasil akan ditimpa saat dijalankan ulang.', ''
];
fs.writeFileSync('output/load-test-report.md', lines.join('\n'));
console.log('output/load-test-report.md');
