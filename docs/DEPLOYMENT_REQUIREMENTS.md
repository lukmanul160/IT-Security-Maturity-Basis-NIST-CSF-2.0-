# Catatan kebutuhan CPU dan storage deployment

Tanggal: 9 November 2026.

## Spesifikasi awal

Estimasi berikut untuk satu VM/server yang menjalankan backend Node.js,
PostgreSQL, dan reverse proxy HTTPS. Frontend hasil build disajikan backend.
Angka ini adalah anggaran kapasitas awal, bukan minimum terukur atau jaminan
jumlah pengguna. Beban impor/ekspor, scan browser, dan backup memengaruhi kebutuhan.

| Penggunaan | CPU | RAM | Storage awal |
| --- | --- | --- | --- |
| Uji coba / pilot dengan data kecil | 2 vCPU | 4 GB | 50 GB SSD |
| Produksi awal, aktivitas internal ringan–sedang | 4 vCPU | 8 GB | 100 GB SSD |
| Impor/ekspor besar atau scan browser rutin | 8 vCPU | 16 GB | 200 GB SSD atau hasil perhitungan data |

**Usulan pengadaan awal: 4 vCPU, RAM 8 GB, SSD 100 GB yang dapat diperbesar,
serta media backup terpisah.** Pilih 8 vCPU / 16 GB bila scan browser dan operasi
berat sering berjalan bersamaan. Profil pilot tidak menjadi acuan produksi.
vCPU berarti CPU virtual yang dialokasikan VM; performanya bergantung pada host
dan pembagian resource. Tabel tidak menetapkan kapasitas pengguna simultan.

Untuk Docker Desktop, resource ini perlu tersedia bagi VM Linux Docker di luar
kebutuhan OS host dan aplikasi lain. Build frontend di server juga membutuhkan
cadangan RAM dan disk; bila memakai spesifikasi kecil, build saat beban rendah.

## Perhitungan storage

Contoh pembagian anggaran **100 GB**, bukan partisi wajib:

| Komponen | Anggaran |
| --- | ---: |
| OS, runtime, dependency, image dan cache build | 25 GB |
| PostgreSQL, indeks dan WAL | 15 GB |
| Evidence/upload lokal | 20 GB |
| Arsip backup lokal dan ruang kerja sementara | 20 GB |
| Ruang kosong untuk pertumbuhan | 20 GB |

Anggaran tersebut harus dinaikkan bila data melampauinya. Gunakan rumus:

`kapasitas disk >= (sistem + database/indeks/WAL + file lokal + backup lokal + ruang sementara puncak) / 0,8`

Rumus menyisakan sekitar 20% disk kosong. Hitung data pada akhir periode
perencanaan, misalnya 12 bulan, bukan hanya data saat instalasi.

- File: jumlah file × ukuran rata-rata × pertumbuhan/masa simpan. Contoh
  10.000 file × 5 MB sekitar 50 GB sebelum backup dan overhead filesystem.
- Database: termasuk data bisnis, audit log dan evidence Compliance Security
  Checklist yang disimpan sebagai BYTEA. File template disalin ke assignment,
  sehingga penggunaan ulang template berlampiran menambah ukuran database.
  Jangan menghitung file BYTEA yang sama lagi sebagai upload lokal.
- Backup: jumlah salinan yang dipertahankan × ukuran backup aktual. Jangan
  mengasumsikan rasio kompresi tertentu; PDF/gambar bisa sulit dikompresi.
- Ruang sementara: restore dump terbagi memerlukan seluruh bagian unggahan
  sekaligus dump gabungan; sediakan sedikitnya dua kali ukuran dump untuk tahap
  tersebut, ditambah ruang PostgreSQL/WAL dan arsip lain yang masih disimpan.
  Ukuran dump terkompresi tidak sama dengan ukuran database setelah restore.

Jika file dipindahkan ke NAS/S3/GCS, kapasitas file dialokasikan di media tersebut;
database, cache/image, arsip backup dan ruang sementara tetap perlu disk server.
Penggantian pengaturan storage tidak otomatis memindahkan file lama.

## CPU, browser scan dan deployment

- Satu proses backend menjalankan aplikasi. Penambahan vCPU membantu pembagian
  kerja dengan PostgreSQL, Chrome, worker dan backup; tidak membuat semua request
  Node.js otomatis berjalan paralel pada seluruh core.
- Scan browser membutuhkan Chrome/Chromium di server dan sandbox yang berfungsi.
  Dockerfile saat ini belum memasang Chromium. Anggaran resource lebih besar
  saja tidak mengaktifkan fitur tersebut; image/runtime perlu disiapkan terpisah.
- Compose saat ini tidak menetapkan batas CPU/RAM per service. Resource pada
  tabel adalah alokasi host/VM, bukan batas container yang sudah dikonfigurasi.
- Jangan menambah replika backend tanpa rancangan session store bersama:
  session saat ini berada di memori proses.

## Storage persisten dan backup

Docker memakai volume `postgres_data`, `app_data`, `uploads`, dan `backups`.
Pertahankan volume saat pembaruan. File sementara default berada di writable
layer container; untuk dump besar pertimbangkan mount disk khusus pada `/tmp`.
Jangan memakai tmpfs untuk dump besar karena menggunakan RAM.

Simpan backup di media/server terpisah dari disk aplikasi. Backup lengkap mencakup
database, file evidence di seluruh lokasi, kunci SMTP dan konfigurasi yang
diamankan. Volume persisten dan backup di disk yang sama tidak melindungi dari
kerusakan disk. Tetapkan retensi, misalnya 7 harian + 4 mingguan, lalu hitung
kapasitas semua salinan; contoh retensi ini belum diatur otomatis oleh catatan ini.
Uji restore hanya dengan fixture atau instalasi uji terpisah.

## Validasi sebelum menetapkan kapasitas final

Uji dengan volume data dan akun berbeda yang mewakili penggunaan nyata,
termasuk dashboard, upload, impor/ekspor, scan browser dan backup. Pantau CPU,
RAM, latency p95, error, I/O disk, ukuran database/WAL dan pertumbuhan file.
Sebagai ambang operasional awal, tinjau kapasitas bila CPU terus di atas 70%,
RAM di atas 80%/mulai swap, atau ruang disk kosong di bawah 20%. Ambang ini
adalah pemicu evaluasi, bukan batas kemampuan aplikasi yang sudah terukur.

Catatan ini dibuat dari pemeriksaan dokumentasi dan konfigurasi repository,
tanpa membaca `.env` atau data operasional. Tidak ada perubahan perilaku runtime.
Tidak dilakukan benchmark baru, deployment Docker/cloud, atau pengujian restore.
Benchmark lama memakai data sintetis dan banyak register kosong; hasilnya
tidak membuktikan kapasitas produksi maupun fitur scan/checklist terbaru.

Referensi internal:

- [Deployment Docker](DOCKER.md) dan [Compose](../compose.yaml).
- [Penyimpanan file](file-storage.md) dan [backup/restore](database-backup.md).
- [Technology Asset dan browser scan](technology-asset.md).
- [Checklist dan evidence](compliance-office-design.md).
- [Batas benchmark sebelumnya](performance-modules-2026-10-19.md).

## Tambahan deployment Nginx HTTPS

Compose kini menyertakan Nginx dan volume nginx_tls untuk
sertifikat, private key, CA dan state. Sertakan pada anggaran sistem/backup
serta lindungi salinan private key. Port host hanya 80/443.
Lihat [arsitektur dan operasi HTTPS](DOCKER_HTTPS.md). Anggaran CPU/RAM/storage
di atas tetap estimasi awal dan belum diuji ulang dengan stack Nginx.
