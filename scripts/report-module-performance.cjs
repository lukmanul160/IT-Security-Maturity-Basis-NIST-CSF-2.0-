const fs = require('node:fs');
const load = file => JSON.parse(fs.readFileSync('output/' + file, 'utf8'));
const http = load('all-module-performance-after.json');
const before = load('module-summary-before.json');
const small = load('module-summary-after-small.json');
const large = load('module-summary-after.json');
const dates = load('dashboard-date-performance.json');
const final = load('all-module-performance-dashboard-final.json');
const round = value => value.toFixed(1);
const ids = [...new Set(http.results.map(row => row.id))];
const sum = report => report.results.find(row => row.id === 'all-summaries').medianMs;
const lines = [
  '# Performance modul — 19 Oktober 2026', '',
  `Node ${http.node}, Windows, PostgreSQL 18.6 sementara pada loopback. ${ids.length} endpoint representatif, ${http.results.length} tahap, ${http.results.reduce((n, r) => n + r.requests, 0)} request; ${http.results.reduce((n, r) => n + r.errors, 0)} kegagalan.`, '',
  '## Metode dan batas verifikasi', '',
  '- `performance-all-modules.cjs` membuat cluster PostgreSQL miliknya sendiri dengan initdb, port sementara, database nist_perf_disposable, dan folder data/upload/backup di direktori temporary. .env tidak dimuat. Cluster dihentikan dan direktori miliknya dihapus setelah pengujian. Data operasional tidak digunakan.',
  '- Data berasal dari reference seed yang ter-commit dan 1.000 Knowledge Notes sintetis. Banyak register bisnis kosong; ini bukan volume data produksi representatif. Audit normal tetap menulis ke database uji. Scheduler dan pengiriman email tidak dijalankan.',
  '- Satu sesi admin sintetis; endpoint GET per modul, 1/10/25 request simultan, satu detik per tahap setelah satu preflight. Latency mencakup drain; p95 mencakup respons gagal. Dashboard juga diperiksa agar semua sumber ready. Generator dan aplikasi berada dalam proses/host yang sama, memakai fetch default; hasil dipengaruhi CPU, disk, pertumbuhan audit, urutan tahap dan koneksi client.',
  '- Framework TPRM dan tiering adalah referensi UI dengan API TPRM bersama. Assessment tahunan mencakup CSF, privacy, IKAS, ISO/SOA, sasaran dan gap. Endpoint admin mencakup akun/izin/audit/backup/SMTP/storage/branding/recipient. Ini bukan pengujian seluruh operasi CRUD/import/export/restore maupun LCP/browser setiap halaman.',
  '- Tahap satu detik terlalu pendek untuk klaim kapasitas, SLA atau persentil produksi yang stabil. Tidak ada soak test, role mix, cloud/Docker nyata, jaringan eksternal, atau pengujian backup/restore produksi. Bundle besar masih mendapat peringatan Vite; pemuatan awal browser pada perangkat/jaringan lambat masih perlu diukur terpisah.', '',
  '## Perbaikan', '',
  '- Dashboard monitoring memakai ulang formatter Bangkok dan indeks bulan, sehingga formatter tidak dibuat untuk setiap record. Risk, Risk Acceptance dan helper dashboard bersama memakai pola yang sama tanpa cache tanggal; pergantian hari tetap mengikuti waktu saat pemanggilan.',
  '- Refresh dashboard yang sedang berjalan digabung hanya untuk user ID, username, role dan matriks izin yang sama. Izin diperiksa setiap request. Hasil selesai langsung dilepas, termasuk hasil parsial; refresh berikutnya membaca data baru. Penggabungan tidak berlaku lintas pengguna, sehingga beban banyak akun berbeda masih perlu diuji.',
  '- Routing assessment hanya membaca metadata legacy dan memakai ulang metadata default dalam request yang sama. Sebelumnya snapshot JSON lengkap dapat dibaca tiga kali untuk permintaan non-legacy; sekarang hanya pembacaan isi oleh service yang mengambil snapshot lengkap. Transaksi dan row lock penulisan tetap dipertahankan.',
  '- Knowledge Notes berbagi promise inisialisasi di service agar startup dan akses pertama tidak mengulang migrasi. Router sebelumnya sudah menggabungkan inisialisasi antar-request; perubahan ini bukan optimasi query daftar setiap request. Kegagalan inisialisasi menghapus promise agar dapat dicoba ulang.',
  '- Logging debug Policy Register pada setiap request dihapus. Audit terstruktur tetap aktif. Backend perlu restart; frontend sudah dibangun dari sumber.', '',
  '## Benchmark CPU sebelum/sesudah', '',
  `Ringkasan dashboard dengan fixture 100 baris/modul: median ${round(sum(before))} ms → ${round(sum(small))} ms. Sesudah perbaikan, fixture 1.000 baris/modul: ${round(sum(large))} ms. Masing-masing lima sampel setelah pemanasan; SQL, storage, assessment dan permission diberi fixture. Ini ukuran logika agregasi, bukan latency endpoint. Baseline 1.000 baris dihentikan setelah RSS sekitar 5 GB; tidak dipakai sebagai hasil selesai.`, '',
  '| Helper UI (100 pemanggilan) | Sebelum ms | Sesudah ms |',
  '|---|---:|---:|',
  ...[...new Set(dates.results.map(row => row.file))].map(file => `| ${file} | ${round(dates.results.find(row => row.file === file && row.version === 'before').medianMs)} | ${round(dates.results.find(row => row.file === file && row.version === 'after').medianMs)} |`), '',
  'Helper UI dijalankan dari source asli dalam VM, lima sampel setelah pemanasan; hasil tanggal sebelum/sesudah dicocokkan. Waktu render DOM/paint tidak diukur.', '',
  '## HTTP per modul setelah perbaikan', '',
  '| Modul | p95 c=1 ms | p95 c=10 ms | p95 c=25 ms | Error total |',
  '|---|---:|---:|---:|---:|',
  ...ids.map(id => {
    const rows = http.results.filter(row => row.id === id);
    return `| ${id} | ${[1, 10, 25].map(c => round(rows.find(row => row.concurrency === c).p95Ms)).join(' | ')} | ${rows.reduce((n, row) => n + row.errors, 0)} |`;
  }), '',
  'IKAS p95 pada 25 koneksi turun dari 2.446 ms pada percobaan awal menjadi 734 ms setelah pengurangan pembacaan snapshot. Angka endpoint lain tidak selalu membaik; variasi host dan tahap singkat membatasi atribusi. Knowledge Notes masih mendekati 799 ms pada 25 koneksi saat mengirim 1.000 catatan lengkap; pagination/pencarian server untuk vault besar memerlukan perubahan kontrak UI dan pengujian tersendiri.', '',
  '## Dashboard setelah penggabungan refresh', '',
  'Pengukuran tambahan tiga detik per tahap, PostgreSQL dan fixture baru, satu identitas admin yang sama. Tidak setara dengan 100 pengguna berbeda. Semua respons dashboard divalidasi agar tidak parsial.', '',
  '| Koneksi | Request | p95 ms | Sukses/detik | Error |',
  '|---:|---:|---:|---:|---:|',
  ...final.results.map(row => `| ${row.concurrency} | ${row.requests} | ${round(row.p95Ms)} | ${round(row.successfulRps)} | ${row.errors} |`), '',
  '## Verifikasi', '',
  '- Suite aplikasi pada PostgreSQL sementara: 371 lulus, 5 dilewati, 0 gagal. Log: output/performance-regression-postgres.tap.',
  '- Tes terarah: 37 lulus, termasuk izin/identitas, penggabungan refresh, data tetap fresh, retry inisialisasi, kalender Bangkok dan filter dashboard.',
  '- Browser Monitoring Dashboard dengan fixture: desktop/mobile, filter, drill-down, bilingual, refresh, unavailable/empty state lulus. Ini bukan tes performa render seluruh modul.',
  '- npm run build berhasil; peringatan bundle >500 KB dan font yang diselesaikan saat runtime tetap ada.', '',
  'Percobaan pertama menjalankan suite di mode tanpa database; tes integrasi membutuhkan PostgreSQL sehingga hasil tersebut tidak dipakai untuk penerimaan. Suite kemudian diulang pada PostgreSQL sementara dan lulus. Pembersihan log percobaan pertama, file JSON duplikat dan satu direktori temporary lama ditolak pemeriksaan persetujuan otomatis (blocked by policy); server PostgreSQL temporary lama sudah dihentikan. Direktori milik run HTTP/regresi yang selesai berhasil dibersihkan oleh harness.', '',
  '## Menjalankan ulang', '',
  'Dependency sesuai package-lock harus sudah terpasang dan PostgreSQL bin (initdb/pg_ctl) tersedia. Default Windows: C:/Program Files/PostgreSQL/18/bin. PERF_PG_BIN dapat diarahkan ke direktori bin instalasi uji, termasuk pada Linux. Script tidak memakai server PostgreSQL operasional yang sedang aktif.', '',
  '```powershell',
  'npm.cmd run test:performance',
  'npm.cmd run test:performance-unit',
  'npm.cmd run benchmark:modules',
  'node scripts/benchmark-dashboard-dates.cjs',
  '# Opsional: PERF_SECONDS, PERF_LEVELS, PERF_MODULES (ID tabel di atas), PERF_LABEL.',
  '# Baseline CPU memakai implementasi monitoring yang ter-commit pada HEAD:',
  "$env:PERF_ROWS='100'", 
  'node scripts/benchmark-module-summaries.cjs before --baseline',
  'node scripts/benchmark-module-summaries.cjs after-small',
  'node scripts/report-module-performance.cjs',
  '```', '',
  'Artefak JSON di output/: all-module-performance-initial.json (percobaan awal; dua preflight salah URL telah diperbaiki, dan dua endpoint assessment saat itu menunjuk CSF), all-module-performance-after.json, all-module-performance-dashboard-final.json, module-summary-before.json, module-summary-after-small.json, module-summary-after.json, dashboard-date-performance.json. Baseline HEAD berubah setelah commit sehingga perbandingan source perlu merujuk revisi sebelum perbaikan untuk reproduksi historis.', '',
];
fs.writeFileSync('docs/performance-modules-2026-10-19.md', lines.join('\n'));
