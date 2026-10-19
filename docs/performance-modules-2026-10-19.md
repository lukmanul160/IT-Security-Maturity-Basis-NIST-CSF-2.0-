# Performance modul — 19 Oktober 2026

Node v24.19.0, Windows, PostgreSQL 18.6 sementara pada loopback. 42 endpoint representatif, 126 tahap, 22987 request; 0 kegagalan.

## Metode dan batas verifikasi

- `performance-all-modules.cjs` membuat cluster PostgreSQL miliknya sendiri dengan initdb, port sementara, database nist_perf_disposable, dan folder data/upload/backup di direktori temporary. .env tidak dimuat. Cluster dihentikan dan direktori miliknya dihapus setelah pengujian. Data operasional tidak digunakan.
- Data berasal dari reference seed yang ter-commit dan 1.000 Knowledge Notes sintetis. Banyak register bisnis kosong; ini bukan volume data produksi representatif. Audit normal tetap menulis ke database uji. Scheduler dan pengiriman email tidak dijalankan.
- Satu sesi admin sintetis; endpoint GET per modul, 1/10/25 request simultan, satu detik per tahap setelah satu preflight. Latency mencakup drain; p95 mencakup respons gagal. Dashboard juga diperiksa agar semua sumber ready. Generator dan aplikasi berada dalam proses/host yang sama, memakai fetch default; hasil dipengaruhi CPU, disk, pertumbuhan audit, urutan tahap dan koneksi client.
- Framework TPRM dan tiering adalah referensi UI dengan API TPRM bersama. Assessment tahunan mencakup CSF, privacy, IKAS, ISO/SOA, sasaran dan gap. Endpoint admin mencakup akun/izin/audit/backup/SMTP/storage/branding/recipient. Ini bukan pengujian seluruh operasi CRUD/import/export/restore maupun LCP/browser setiap halaman.
- Tahap satu detik terlalu pendek untuk klaim kapasitas, SLA atau persentil produksi yang stabil. Tidak ada soak test, role mix, cloud/Docker nyata, jaringan eksternal, atau pengujian backup/restore produksi. Bundle besar masih mendapat peringatan Vite; pemuatan awal browser pada perangkat/jaringan lambat masih perlu diukur terpisah.

## Perbaikan

- Dashboard monitoring memakai ulang formatter Bangkok dan indeks bulan, sehingga formatter tidak dibuat untuk setiap record. Risk, Risk Acceptance dan helper dashboard bersama memakai pola yang sama tanpa cache tanggal; pergantian hari tetap mengikuti waktu saat pemanggilan.
- Refresh dashboard yang sedang berjalan digabung hanya untuk user ID, username, role dan matriks izin yang sama. Izin diperiksa setiap request. Hasil selesai langsung dilepas, termasuk hasil parsial; refresh berikutnya membaca data baru. Penggabungan tidak berlaku lintas pengguna, sehingga beban banyak akun berbeda masih perlu diuji.
- Routing assessment hanya membaca metadata legacy dan memakai ulang metadata default dalam request yang sama. Sebelumnya snapshot JSON lengkap dapat dibaca tiga kali untuk permintaan non-legacy; sekarang hanya pembacaan isi oleh service yang mengambil snapshot lengkap. Transaksi dan row lock penulisan tetap dipertahankan.
- Knowledge Notes berbagi promise inisialisasi di service agar startup dan akses pertama tidak mengulang migrasi. Router sebelumnya sudah menggabungkan inisialisasi antar-request; perubahan ini bukan optimasi query daftar setiap request. Kegagalan inisialisasi menghapus promise agar dapat dicoba ulang.
- Logging debug Policy Register pada setiap request dihapus. Audit terstruktur tetap aktif. Backend perlu restart; frontend sudah dibangun dari sumber.

## Benchmark CPU sebelum/sesudah

Ringkasan dashboard dengan fixture 100 baris/modul: median 3852.1 ms → 10.8 ms. Sesudah perbaikan, fixture 1.000 baris/modul: 52.8 ms. Masing-masing lima sampel setelah pemanasan; SQL, storage, assessment dan permission diberi fixture. Ini ukuran logika agregasi, bukan latency endpoint. Baseline 1.000 baris dihentikan setelah RSS sekitar 5 GB; tidak dipakai sebagai hasil selesai.

| Helper UI (100 pemanggilan) | Sebelum ms | Sesudah ms |
|---|---:|---:|
| risk-management/dashboard.js | 13.0 | 0.5 |
| risk-acceptance/dashboard.js | 100.1 | 11.5 |
| shared/governance-dashboard.js | 41.4 | 2.8 |

Helper UI dijalankan dari source asli dalam VM, lima sampel setelah pemanasan; hasil tanggal sebelum/sesudah dicocokkan. Waktu render DOM/paint tidak diukur.

## HTTP per modul setelah perbaikan

| Modul | p95 c=1 ms | p95 c=10 ms | p95 c=25 ms | Error total |
|---|---:|---:|---:|---:|
| csf | 37.5 | 659.3 | 409.4 | 0 |
| assessment | 21.3 | 69.6 | 166.7 | 0 |
| privacy | 23.2 | 89.1 | 160.1 | 0 |
| privacy-assessment | 24.0 | 142.2 | 203.2 | 0 |
| framework | 20.6 | 75.4 | 98.6 | 0 |
| iso27001 | 25.8 | 64.4 | 148.2 | 0 |
| iso27001-soa | 28.0 | 76.4 | 179.9 | 0 |
| iso-objectives | 21.8 | 40.1 | 127.5 | 0 |
| ikas | 64.6 | 326.0 | 733.8 | 0 |
| ikas-assessment | 39.4 | 163.0 | 438.8 | 0 |
| assessment-periods | 20.2 | 51.0 | 122.3 | 0 |
| assessment-gaps | 19.1 | 66.1 | 154.1 | 0 |
| budget | 19.3 | 73.3 | 316.5 | 0 |
| risk-management | 19.0 | 101.7 | 147.6 | 0 |
| risk-acceptance | 22.7 | 47.6 | 104.4 | 0 |
| threat-modelling | 19.1 | 86.2 | 240.8 | 0 |
| policy-register | 22.5 | 60.7 | 86.6 | 0 |
| asset-register | 22.7 | 52.7 | 109.1 | 0 |
| server-racks | 24.7 | 71.0 | 109.6 | 0 |
| asset-modelling | 21.4 | 51.1 | 83.0 | 0 |
| personnel-certification | 18.7 | 58.4 | 163.4 | 0 |
| certification-roadmap | 91.4 | 279.2 | 491.9 | 0 |
| tprm-register | 22.1 | 54.2 | 93.7 | 0 |
| tprm-questionnaire | 19.9 | 42.7 | 112.8 | 0 |
| questionnaire-templates | 18.5 | 55.4 | 216.0 | 0 |
| audit-finding-tracker | 23.3 | 186.3 | 275.3 | 0 |
| knowledge-notes | 78.8 | 284.8 | 798.9 | 0 |
| files | 22.3 | 225.5 | 307.1 | 0 |
| reporting-regulator | 17.7 | 49.0 | 647.7 | 0 |
| narahubung | 33.9 | 473.8 | 223.5 | 0 |
| surat-pernyataan | 23.8 | 176.0 | 274.7 | 0 |
| office-design | 21.9 | 101.1 | 273.6 | 0 |
| account | 19.3 | 63.3 | 283.2 | 0 |
| permissions | 27.4 | 102.9 | 131.5 | 0 |
| audit | 35.1 | 112.7 | 264.8 | 0 |
| backups | 16.7 | 36.8 | 104.5 | 0 |
| file-backups | 19.7 | 30.3 | 234.2 | 0 |
| smtp | 16.7 | 47.1 | 95.1 | 0 |
| storage | 18.4 | 37.6 | 105.3 | 0 |
| website-settings | 17.2 | 48.6 | 78.9 | 0 |
| reminder-recipients | 18.2 | 33.8 | 85.1 | 0 |
| monitoring-dashboard | 62.4 | 375.8 | 792.3 | 0 |

IKAS p95 pada 25 koneksi turun dari 2.446 ms pada percobaan awal menjadi 734 ms setelah pengurangan pembacaan snapshot. Angka endpoint lain tidak selalu membaik; variasi host dan tahap singkat membatasi atribusi. Knowledge Notes masih mendekati 799 ms pada 25 koneksi saat mengirim 1.000 catatan lengkap; pagination/pencarian server untuk vault besar memerlukan perubahan kontrak UI dan pengujian tersendiri.

## Dashboard setelah penggabungan refresh

Pengukuran tambahan tiga detik per tahap, PostgreSQL dan fixture baru, satu identitas admin yang sama. Tidak setara dengan 100 pengguna berbeda. Semua respons dashboard divalidasi agar tidak parsial.

| Koneksi | Request | p95 ms | Sukses/detik | Error |
|---:|---:|---:|---:|---:|
| 1 | 66 | 67.3 | 21.8 | 0 |
| 10 | 381 | 110.0 | 123.3 | 0 |
| 25 | 500 | 187.4 | 165.1 | 0 |
| 100 | 700 | 504.1 | 230.8 | 0 |

## Verifikasi

- Suite aplikasi pada PostgreSQL sementara: 371 lulus, 5 dilewati, 0 gagal. Log: output/performance-regression-postgres.tap.
- Tes terarah: 37 lulus, termasuk izin/identitas, penggabungan refresh, data tetap fresh, retry inisialisasi, kalender Bangkok dan filter dashboard.
- Browser Monitoring Dashboard dengan fixture: desktop/mobile, filter, drill-down, bilingual, refresh, unavailable/empty state lulus. Ini bukan tes performa render seluruh modul.
- npm run build berhasil; peringatan bundle >500 KB dan font yang diselesaikan saat runtime tetap ada.

Percobaan pertama menjalankan suite di mode tanpa database; tes integrasi membutuhkan PostgreSQL sehingga hasil tersebut tidak dipakai untuk penerimaan. Suite kemudian diulang pada PostgreSQL sementara dan lulus. Pembersihan log percobaan pertama, file JSON duplikat dan satu direktori temporary lama ditolak pemeriksaan persetujuan otomatis (blocked by policy); server PostgreSQL temporary lama sudah dihentikan. Direktori milik run HTTP/regresi yang selesai berhasil dibersihkan oleh harness.

## Menjalankan ulang

Dependency sesuai package-lock harus sudah terpasang dan PostgreSQL bin (initdb/pg_ctl) tersedia. Default Windows: C:/Program Files/PostgreSQL/18/bin. PERF_PG_BIN dapat diarahkan ke direktori bin instalasi uji, termasuk pada Linux. Script tidak memakai server PostgreSQL operasional yang sedang aktif.

```powershell
npm.cmd run test:performance
npm.cmd run test:performance-unit
npm.cmd run benchmark:modules
node scripts/benchmark-dashboard-dates.cjs
# Opsional: PERF_SECONDS, PERF_LEVELS, PERF_MODULES (ID tabel di atas), PERF_LABEL.
# Baseline CPU memakai implementasi monitoring yang ter-commit pada HEAD:
$env:PERF_ROWS='100'
node scripts/benchmark-module-summaries.cjs before --baseline
node scripts/benchmark-module-summaries.cjs after-small
node scripts/report-module-performance.cjs
```

Artefak JSON di output/: all-module-performance-initial.json (percobaan awal; dua preflight salah URL telah diperbaiki, dan dua endpoint assessment saat itu menunjuk CSF), all-module-performance-after.json, all-module-performance-dashboard-final.json, module-summary-before.json, module-summary-after-small.json, module-summary-after.json, dashboard-date-performance.json. Baseline HEAD berubah setelah commit sehingga perbandingan source perlu merujuk revisi sebelum perbaikan untuk reproduksi historis.
