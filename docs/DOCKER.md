# Menjalankan IT_Governance_BLACKOWL dengan Docker

Deployment sekarang wajib melalui **Nginx HTTPS**. Ikuti
[setup IP, trust CA, gambar arsitektur dan migrasi domain](DOCKER_HTTPS.md).

Gunakan Docker Engine atau Docker Desktop dengan Linux containers dan Docker
Compose v2. Build mengunduh paket npm dan image sehingga membutuhkan internet.

Ini adalah opsi deployment alternatif dari instalasi langsung Node.js. Host
cukup memiliki Docker dan Compose; tidak perlu memasang Node.js, npm,
PostgreSQL server, atau PostgreSQL client tools. Source aplikasi tetap diperlukan
untuk build image. Dockerfile memasang dependency dan membangun Vue/Tailwind
di tahap build, lalu menjalankan backend dengan Node.js di container aplikasi.
PostgreSQL berjalan di container database yang disediakan Compose.

Semua perintah `npm` dalam panduan ini dijalankan melalui `docker compose exec`
di dalam container. Untuk deployment langsung tanpa Docker, gunakan
[panduan instalasi Linux/Windows](INSTALLATION.md).

Nama container aplikasi: **IT_Governance_BLACKOWL**. Nama database PostgreSQL
dan container database: **BlackOwl_DB_Gov**. Nama image dan project Compose
memakai huruf kecil sesuai format Docker: `it_governance_blackowl`.

## Instalasi pertama

Dari root repository, buat konfigurasi Docker terpisah dari `.env` instalasi lama.

PowerShell:

```powershell
Copy-Item docker.env.example .env.docker
notepad .env.docker
```

Linux/macOS:

```bash
cp docker.env.example .env.docker
# Edit .env.docker dengan editor Anda.
```

Isi `BLACKOWL_DB_PASSWORD` dengan password acak Anda sendiri. Set
`BLACKOWL_ADDRESS` ke IP VM. Sertifikat lokal dibuat pada startup. Port publik adalah 80/443. Untuk nilai yang mengandung `$`
atau `#`, bungkus dengan petik tunggal agar dibaca secara literal oleh Compose.

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
```

Tunggu aplikasi siap, lalu login memakai **admin / admin**.

Instalasi baru otomatis membuat administrator **`admin`** dengan password **`admin`** saat tabel akun kosong, termasuk mode production. Akun dan password lama tetap dipertahankan. Setelah login pertama, ubah password melalui Account Management. `admin:create` tetap tersedia untuk administrator tambahan.

Mode production menjalankan seed data referensi aplikasi.
Startup memanggil provisioning database, lalu inisialisasi dan seed setiap modul:

- NIST CSF dari `data/csf-data.json`.
- NIST Privacy dari `data/privacy-data.json`.
- ISO 27001 dan SOA dari `data/iso-27001-data.json` dan `data/iso-27001-soa-data.json`.
- Indikator risiko dari `data/risk-indicators.json`.
- Katalog roadmap sertifikasi dari `data/personnel-certifications-seed.json`.

File tersebut disertakan dalam image Docker. Pada database baru, data awal
dimasukkan sebelum server menerima koneksi. CSF, Privacy, dan indikator risiko
diisi jika tabel/cakupannya kosong; katalog sertifikasi menambahkan nama yang
belum ada. ISO/SOA juga memperbarui sejumlah kolom referensi saat startup.
Mengubah file seed saja tidak menjamin seluruh perubahan masuk ke database lama.

Tidak perlu menjalankan `db:setup` lagi karena provisioning tersebut sudah
dipanggil oleh startup. Jika ingin menjalankannya secara eksplisit:

```bash
docker compose --env-file .env.docker exec app npm run db:setup
```

Perintah ini menyiapkan schema dasar dan katalog sertifikasi; **bukan pengganti
startup untuk seluruh seed modul**. Untuk menjalankan kembali inisialisasi modul:

```bash
docker compose --env-file .env.docker restart app
docker compose --env-file .env.docker logs -f app
```

Jika ada data operasional tambahan yang harus masuk, gunakan import/restore
atau migrasi seed khusus sesuai format datanya. Docker tidak otomatis membaca
semua file SQL/JSON tambahan dalam repository.

Buka **https://IP-VM/login** setelah trust root CA pada perangkat pengguna. Docker
menyediakan database baru; data instalasi non-Docker tidak otomatis dipindahkan.

## Konfigurasi dan penyimpanan

Untuk akses dari komputer lain, ikuti [panduan jaringan LAN](NETWORK_ACCESS.md),
termasuk contoh `https://192.168.130.12`, binding port, dan pemeriksaan firewall.

| Pengaturan | Default | Kegunaan |
| --- | --- | --- |
| `BLACKOWL_DB_PASSWORD` | wajib diisi | Password PostgreSQL |
| `BLACKOWL_ADDRESS` | wajib diisi | IP VM atau domain tanpa skema/port |
| `BLACKOWL_BIND_IP` | `0.0.0.0` | Interface host Nginx |
| Template SSL | lokal default | Aktifkan SSL sendiri di deploy/nginx/templates/default.conf.template |

Mode production tetap aktif dan cookie Secure selalu aktif. Nginx melayani
HTTPS 443 serta redirect HTTP 80, lalu meneruskan HTTP ke `app:8000` pada
jaringan proxy. Backend tidak mempublikasikan port host. PostgreSQL hanya
dapat diakses aplikasi melalui jaringan database pada `db:5432`.
Untuk memeriksa database:

```bash
docker compose --env-file .env.docker exec db psql -U blackowl -d BlackOwl_DB_Gov
```

| Volume | Isi |
| --- | --- |
| `postgres_data` | Database PostgreSQL |
| `app_data` | Seed JSON, kunci SMTP, dan antrean audit |
| `uploads` | Evidence dan file unggahan lokal |
| `backups` | Cadangan database dan file yang dibuat aplikasi |
| `nginx_tls` | Sertifikat dan CA lokal; backup private key secara aman |

Volume memiliki prefix project `it_governance_blackowl_` dan tetap ada setelah
`docker compose down`. Jangan gunakan `down -v` kecuali ingin menghapus semua
data Docker ini. Image tidak menyertakan `.env`, password, kunci SMTP, file
unggahan, database backup, atau workbook operasional dari host.

### Instalasi ulang dengan data yang sudah ada

Untuk instalasi ulang atau rebuild, gunakan `.env.docker` yang sudah ada dan
jalankan `docker compose --env-file .env.docker up -d --build`. Jangan menyalin
template lagi ke `.env.docker` karena dapat menimpa konfigurasi/password lama. Tambahkan ADDRESS/template SSL sesuai panduan HTTPS.
Compose memakai kembali volume data di atas; database yang sudah ada tidak
dibuat ulang oleh PostgreSQL.

Pertahankan nama project `it_governance_blackowl` dan jangan menjalankan dengan
`-p` yang berbeda. Nama project berbeda memakai volume berbeda sehingga data
lama tidak terlihat. Jangan memakai `down -v`, menghapus volume secara manual,
atau mereset data Docker Desktop jika data masih diperlukan.

Data instalasi langsung/non-Docker tidak otomatis masuk ke volume Docker.
Jika yang ingin dipertahankan adalah data instalasi lama, lakukan backup dan
restore database serta file terlebih dahulu sesuai [panduan backup](database-backup.md).
Volume permanen menjaga data saat container diganti; tetap simpan backup di
luar Docker untuk pemulihan jika volume atau disk rusak.

Fitur Database Backup memakai `pg_dump`/`pg_restore` versi 17 yang disertakan
di image aplikasi, sesuai PostgreSQL 17 di service database. Backup database
tetap harus dilengkapi dengan File Backup dan salinan kunci SMTP; lihat
[panduan backup](database-backup.md). Unduh salinan backup ke luar Docker.

NAS/shared storage memakai path Linux di dalam container. Tambahkan mount pada
service `app`, lalu pilih path tersebut di Storage Setting. Jangan memasukkan
path Windows seperti `D:\...` sebagai path internal container. Untuk AWS/GCP,
tambahkan environment kredensial atau mount service-account sendiri sesuai
[panduan penyimpanan](file-storage.md).

## Operasi dan pembaruan

### Redis khusus Docker

Compose menjalankan Redis 7.4 pada jaringan `cache` internal, hanya terhubung
ke aplikasi. Tidak ada port host, volume Redis, snapshot RDB atau AOF. Batas
cache 128 MiB memakai `allkeys-lru`, dengan batas container 192 MiB.
PostgreSQL tetap sumber data utama; Redis tidak perlu di-backup.

Hanya dua fitur memakai Redis:

| Fitur | Masa berlaku | Perilaku |
| --- | --- | --- |
| Monitoring Dashboard | 15 detik | Ringkasan lengkap per identitas, role, matriks izin dan tanggal Bangkok; hasil parsial/gagal tidak disimpan |
| Kandidat CVE NVD | 5 menit | Hasil sukses nama/versi/filter/halaman; cache memori lokal yang sudah ada tetap berlaku |

Izin diperiksa sebelum mengambil dashboard dari cache. Sesudah menyimpan data,
ringkasan dashboard dapat tertinggal hingga 15 detik; refresh dalam jendela ini
dapat memakai `generatedAt` yang sama. Detail/edit tetap membaca sumber utama.
Cache dashboard dipisahkan tiap proses/restart serta dibatalkan pada restore
database. Cache kandidat CVE dapat digunakan kembali setelah restart aplikasi.
Session, password, permission store, formulir, isi Knowledge Notes, evidence,
upload, scan website, backup dan operasi tulis tidak dipindahkan ke Redis.

Image menetapkan `NIST_DOCKER=true`; Compose menetapkan
`REDIS_CACHE_ENABLED=true`. Instalasi langsung tidak membuka koneksi Redis.
Untuk menonaktifkan cache Docker, ubah `REDIS_CACHE_ENABLED` menjadi `"false"`
di Compose dan recreate app. Redis bukan dependency wajib startup app: jika
belum siap/mati, cache dilewati dan data diambil seperti sebelumnya. Koneksi
dan setiap command dibatasi 200 ms, lalu kegagalan memicu jeda percobaan 30 detik.
Payload cache dibatasi 512 KiB. Redis hanya berisi cache yang dapat dibuang.

Update dengan perintah `docker compose --env-file .env.docker up -d --build`.
Periksa Redis dengan `docker compose --env-file .env.docker exec redis redis-cli ping`.
Workflow smoke juga memeriksa round-trip, TTL, invalidasi dan fallback Redis mati
pada project fixture. Pengujian lokal menggunakan mock; Docker/Redis live perlu
dikonfirmasi melalui job tersebut, bukan disimpulkan dari tes konfigurasi.

Workflow GitHub Actions `Docker smoke` berjalan pada pull request, push (termasuk
hasil merge), dan pemicu manual. Pemeriksaan membangun image app/Nginx,
menjalankan PostgreSQL sementara, menunggu healthcheck, memeriksa konfigurasi
Nginx, HTTPS dengan CA lokal, redirect HTTP, hasil build frontend, koneksi
database/akun seed, serta ketersediaan pg_dump/pg_restore. Recreate aplikasi
memeriksa bahwa penanda fixture dalam volume data tetap tersimpan dan proxy
kembali melayani login. Project, jaringan, dan volume memakai nama khusus run;
konfigurasi deployment dan data operasional tidak digunakan.

Pastikan job `docker-smoke` lulus pada commit hasil merge sebelum update server.
Atur sebagai required status check pada branch protection jika merge harus
menunggu hasilnya. Pemeriksaan ini tidak menguji login interaktif, semua modul,
restore database, atau konektivitas/TLS VM tujuan.

Untuk urutan lengkap mulai dari pull repository, backup, rebuild, hingga
pemulihan akun, ikuti [panduan update Docker dan login](UPDATE_DOCKER.md).

```bash
# Hentikan container dengan mempertahankan volume.
docker compose --env-file .env.docker down

# Jalankan kembali.
docker compose --env-file .env.docker up -d

# Setelah memperbarui kode, build dan recreate aplikasi.
docker compose --env-file .env.docker up -d --build
```

Jangan mengganti major PostgreSQL hanya dengan mengubah tag image; lakukan
migrasi database terlebih dahulu. `POSTGRES_PASSWORD` hanya menginisialisasi
password pada volume database baru. Mengubah `.env.docker` setelah volume berisi
data tidak mengganti password role PostgreSQL secara otomatis.

Build baru tetap memakai volume `app_data` lama. Bila pembaruan membawa seed
JSON baru, salin file seed yang sesuai ke `/app/data` sebelum startup/migrasi;
pertahankan `smtp-secret.key` dan `audit-pending`. Data operasional tersimpan
di PostgreSQL dan evidence pada volume upload.

## Pemeriksaan masalah

- `Set BLACKOWL_DB_PASSWORD`: isi `.env.docker` dan selalu pakai `--env-file`.
- Port 80/443 terpakai: selesaikan konflik layanan pada host sebelum menjalankan Nginx.
- Peringatan sertifikat IP: pasang root CA Nginx pada perangkat pengguna; gunakan HTTPS.
- `db` tidak healthy: periksa `docker compose --env-file .env.docker logs db`.
- Aplikasi gagal startup: periksa log `app`; database harus healthy terlebih dahulu.
- Pada Windows, pilih Linux containers di Docker Desktop.

Urutan startup menunggu healthcheck PostgreSQL menggunakan
[`depends_on: condition: service_healthy`](https://docs.docker.com/compose/how-tos/startup-order/).
