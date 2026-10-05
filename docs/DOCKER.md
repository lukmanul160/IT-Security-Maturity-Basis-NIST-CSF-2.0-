# Menjalankan IT_Governance_BLACKOWL dengan Docker

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

Isi `BLACKOWL_DB_PASSWORD` dengan password acak Anda sendiri. Biarkan port 5000
atau ubah `BLACKOWL_PORT` bila sudah digunakan. Untuk nilai yang mengandung `$`
atau `#`, bungkus dengan petik tunggal agar dibaca secara literal oleh Compose.

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
```

Tunggu aplikasi siap. Akun awal `admin` dan `user` dibuat otomatis, termasuk pada
mode production. **Segera ganti password keduanya setelah login pertama**:

| Username | Password awal | Role |
| --- | --- | --- |
| `admin` | `AdminInitial123!` | admin |
| `user` | `UserInitial123!` | user |

Buka **Account → Account Management**, isi password saat ini, password baru,
dan konfirmasi, lalu klik **Save profile**. Login kembali dengan password baru.
Lakukan untuk kedua akun sebelum membuka akses aplikasi ke pengguna lain.
Seed tidak mengganti password akun yang sudah ada saat restart/rebuild.

Jika ingin membuat administrator tambahan, jalankan dari terminal interaktif:

```bash
docker compose --env-file .env.docker exec app npm run admin:create
```

Pilih username baru dan password sendiri. **Mode production menjalankan seed
data aplikasi serta akun awal `admin`/`user`.**
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

Buka **http://localhost:5000/login** (sesuaikan dengan `BLACKOWL_PORT`). Docker
menyediakan database baru; data instalasi non-Docker tidak otomatis dipindahkan.

## Konfigurasi dan penyimpanan

Untuk akses dari komputer lain, ikuti [panduan jaringan LAN](NETWORK_ACCESS.md),
termasuk contoh `192.168.130.12:5000`, binding port, dan pemeriksaan firewall.

| Pengaturan | Default | Kegunaan |
| --- | --- | --- |
| `BLACKOWL_DB_PASSWORD` | wajib diisi | Password PostgreSQL |
| `BLACKOWL_PORT` | `5000` | Port aplikasi pada host |
| `BLACKOWL_BIND_IP` | `127.0.0.1` | Alamat host untuk port aplikasi |
| `BLACKOWL_COOKIE_SECURE` | `false` | `false` untuk HTTP lokal, `true` untuk HTTPS |

Mode production tetap aktif. `SESSION_COOKIE_SECURE` hanya mengatur cookie
login: nilai default aplikasi tetap Secure di production; Compose secara eksplisit
mematikannya untuk HTTP lokal pada loopback. Untuk server yang diakses melalui
jaringan, gunakan reverse proxy HTTPS, pertahankan Host asli, dan atur
`BLACKOWL_COOKIE_SECURE=true`. Jika proxy berjalan di host yang sama, binding
loopback tetap dapat dipakai. Docker Compose ini tidak menyediakan sertifikat TLS.

Port host `5000` diteruskan ke port `8000` di container aplikasi. Aplikasi
terhubung ke PostgreSQL melalui `db:5432` di jaringan Compose. PostgreSQL tidak
membuka port ke host, sehingga tidak bentrok dengan PostgreSQL lain yang memakai
port `5432` pada host atau container lain. Untuk memeriksa database:

```bash
docker compose --env-file .env.docker exec db psql -U blackowl -d BlackOwl_DB_Gov
```

| Volume | Isi |
| --- | --- |
| `postgres_data` | Database PostgreSQL |
| `app_data` | Seed JSON, kunci SMTP, dan antrean audit |
| `uploads` | Evidence dan file unggahan lokal |
| `backups` | Cadangan database dan file yang dibuat aplikasi |

Volume memiliki prefix project `it_governance_blackowl_` dan tetap ada setelah
`docker compose down`. Jangan gunakan `down -v` kecuali ingin menghapus semua
data Docker ini. Image tidak menyertakan `.env`, password, kunci SMTP, file
unggahan, database backup, atau workbook operasional dari host.

### Instalasi ulang dengan data yang sudah ada

Untuk instalasi ulang atau rebuild, gunakan `.env.docker` yang sudah ada dan
jalankan `docker compose --env-file .env.docker up -d --build`. Jangan menyalin
template lagi ke `.env.docker` karena dapat menimpa konfigurasi/password lama.
Compose memakai kembali keempat volume di atas; database yang sudah ada tidak
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
- Port terpakai: ubah `BLACKOWL_PORT`, lalu jalankan `up -d` kembali.
- Login pada HTTP gagal: pastikan `BLACKOWL_COOKIE_SECURE=false` untuk akses lokal.
- `db` tidak healthy: periksa `docker compose --env-file .env.docker logs db`.
- Aplikasi gagal startup: periksa log `app`; database harus healthy terlebih dahulu.
- Pada Windows, pilih Linux containers di Docker Desktop.

Urutan startup menunggu healthcheck PostgreSQL menggunakan
[`depends_on: condition: service_healthy`](https://docs.docker.com/compose/how-tos/startup-order/).
