# Instalasi NIST Basis langkah demi langkah

Pilih **satu metode**: Docker (bagian A) atau manual (bagian B).
Panduan ini untuk instalasi baru. Jika sudah ada data, pertahankan konfigurasi
dan buat backup sebelum memperbarui aplikasi. Jalankan setiap perintah secara
berurutan; lanjutkan hanya jika langkah sebelumnya berhasil.

| Metode | Software pada host | URL lokal |
| --- | --- | --- |
| Docker | Docker dan Compose v2 | http://localhost:5000/login |
| Manual | Node.js 24, npm, PostgreSQL server dan client tools | http://localhost:8000/login |

## 1. Siapkan folder aplikasi

Ekstrak source lengkap atau clone repository milik Anda. Folder harus berisi
`package.json`, `package-lock.json`, `compose.yaml`, `Dockerfile`, `src/`,
`frontend/`, `database/`, `scripts/`, dan file seed dalam `data/`.
Jangan memakai `node_modules` dari komputer/OS lain.

Contoh Windows, jika source diletakkan di `C:\Apps\NISTBasis`:

```powershell
Set-Location 'C:\Apps\NISTBasis'
Test-Path package.json
```

Hasil harus `True`. Sesuaikan path dengan lokasi source Anda.

Contoh Linux:

```bash
cd /lokasi/nist-basis
ls package.json
```

Semua langkah berikut dijalankan dari folder ini. Unduhan dependency/image
membutuhkan koneksi internet.

## A. Instalasi Docker

### A1. Pasang dan jalankan Docker

**Windows 10/11:**

1. Aktifkan virtualisasi di BIOS/UEFI jika belum aktif.
2. Jika WSL belum tersedia, buka PowerShell sebagai Administrator, jalankan
   `wsl --install`, lalu restart jika diminta. Jika sudah ada, gunakan
   `wsl --update`.
3. Unduh dan instal [Docker Desktop resmi](https://docs.docker.com/desktop/setup/install/windows-install/).
   Gunakan backend WSL 2 dan Linux containers.
4. Buka Docker Desktop dan tunggu engine berjalan.
5. Buka terminal baru, lalu kembali ke folder aplikasi pada langkah 1.

**Ubuntu:** instal Docker Engine beserta Compose plugin mengikuti
[langkah resmi Docker untuk Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
Gunakan instruksi repository APT, instal paket `docker-compose-plugin`, lalu
jalankan `sudo systemctl enable --now docker`. Jika akun belum mempunyai akses
Docker, awali seluruh perintah `docker` berikut dengan `sudo`.

Periksa pada kedua OS:

```text
docker version
docker compose version
```

`docker version` harus menampilkan bagian Client dan Server; Compose harus v2.
Untuk Windows Server, gunakan instalasi manual atau host Linux untuk Docker;
Docker Desktop tidak mendukung Windows Server.

### A2. Buat konfigurasi Docker

Windows PowerShell:

```powershell
Copy-Item docker.env.example .env.docker
notepad .env.docker
```

Linux:

```bash
cp docker.env.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

Isi dan simpan:

```dotenv
BLACKOWL_DB_PASSWORD='GANTI_DENGAN_PASSWORD_DATABASE_ANDA'
BLACKOWL_PORT=5000
BLACKOWL_BIND_IP=127.0.0.1
BLACKOWL_COOKIE_SECURE=false
```

Ganti nilai password dengan password panjang pilihan Anda. Petik tunggal menjaga
karakter seperti `$` dan `#` tetap literal. Password ini untuk PostgreSQL;
password login admin dibuat terpisah. File `.env` instalasi manual tidak dipakai
sebagai konfigurasi langkah Docker ini.

### A3. Build dan jalankan

```text
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
```

`config --quiet` berhasil tanpa output. Build pertama dapat memerlukan beberapa
menit. Tunggu `db` healthy, aplikasi selesai startup, dan halaman `/login` dapat
dibuka. Tekan `Ctrl+C` untuk keluar dari tampilan log; container tetap berjalan.
Jika startup gagal, periksa log sebelum melanjutkan.

Database **BlackOwl_DB_Gov**, schema, dan data referensi disiapkan otomatis saat
startup. Tidak perlu menjalankan `db:setup` secara terpisah pada metode Docker.
**Seed tetap berjalan pada mode production**: CSF, Privacy, ISO/SOA, indikator
risiko, katalog sertifikasi, serta akun awal `admin` dan `user`.
Lihat [rincian seed dan perintah eksplisit](DOCKER.md#instalasi-pertama).
Data operasional tambahan perlu import/restore atau migrasi khusus; file SQL/JSON
tambahan tidak otomatis dijalankan.

### A4. Buat administrator

Administrator awal sudah dibuat otomatis. Login dengan `admin` /
`AdminInitial123!`; akun `user` memakai password `UserInitial123!`.
**Segera ubah password kedua akun** melalui **Account → Account Management**:
isi password saat ini, password baru, dan konfirmasi, lalu klik **Save profile**.
Login kembali dengan password baru. Selesaikan sebelum memberikan akses kepada
pengguna lain. Restart/rebuild tidak menimpa password yang sudah diganti.

Perintah berikut opsional untuk membuat administrator tambahan:

```text
docker compose --env-file .env.docker exec app npm run admin:create
```

Jalankan dari terminal interaktif, tanpa opsi `-T`. Masukkan:

1. Username baru, atau Enter untuk `nistadmin`.
2. Nama lengkap (opsional).
3. Password 8–72 karakter, mengandung huruf besar, huruf kecil, dan angka.
4. Konfirmasi password yang sama.

Tunggu pesan bahwa administrator tambahan berhasil dibuat. Pada instalasi ulang,
gunakan akun yang sudah ada; jangan membuat
ulang username yang sama.

### A5. Login dan cek hasil

Buka **http://localhost:5000/login**, lalu login memakai akun langkah A4.
Ikuti pemeriksaan pada bagian C. Port 5000 pada host diteruskan ke 8000 di
container; PostgreSQL hanya tersedia pada jaringan internal sebagai `db:5432`.
Konfigurasi awal hanya dapat diakses dari komputer host.

### A6. Stop, start, dan update

```text
docker compose --env-file .env.docker down
docker compose --env-file .env.docker up -d
```

Untuk update: backup dahulu, perbarui source, lalu jalankan:

```text
docker compose --env-file .env.docker up -d --build
```

Pertahankan `.env.docker`, nama project Compose, dan volume. **Jangan gunakan
`down -v`** jika data masih diperlukan: opsi tersebut menghapus volume database,
upload, data aplikasi, dan backup. Mengubah password di `.env.docker` saja tidak
mengubah password PostgreSQL pada volume yang sudah berisi data.

## B. Instalasi manual tanpa Docker

### B1. Pasang prasyarat

**Windows:**

1. Instal Node.js 24 beserta npm dari [installer resmi Node.js](https://nodejs.org/en/download).
2. Instal [PostgreSQL untuk Windows](https://www.postgresql.org/download/windows/),
   termasuk server dan command line tools. Catat password `postgres` dan port
   database (contoh berikut memakai 5432).
3. Buka PowerShell baru setelah instalasi, lalu kembali ke folder aplikasi.

```powershell
node --version
npm.cmd --version
Get-Service *postgresql*
```

Pastikan Node menampilkan `v24...` dan service PostgreSQL `Running`. Jika belum,
jalankan service melalui aplikasi **Services**. Contoh berikut menggunakan
PostgreSQL 18; sesuaikan angka versi dalam path dengan versi terpasang.

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install -y postgresql postgresql-client git curl ca-certificates xz-utils
sudo systemctl enable --now postgresql
psql --version
pg_dump --version
pg_restore --version
```

Pasang Node.js 24 menggunakan distribusi resmi atau paket organisasi. Langkah
instalasi binary Linux tersedia di [panduan manual bagian 2.2](INSTALLATION.md#22-nodejs-24-lts).
Sesudah instalasi, periksa `node --version` dan `npm --version`.
Engine proyek memerlukan `^20.19.0 || >=22.12.0`; contoh panduan menggunakan 24.
Client `pg_dump`/`pg_restore` sebaiknya sama major version dengan server.

### B2. Buat role PostgreSQL

Windows:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres
```

Masukkan password `postgres` dari installer. Linux:

```bash
sudo -u postgres psql -d postgres
```

Setelah muncul prompt SQL, jalankan:

```sql
CREATE ROLE nist_app WITH LOGIN CREATEDB;
\password nist_app
\q
```

Masukkan password baru untuk role `nist_app` saat diminta dan catat untuk
langkah B3. `CREATEDB` memungkinkan provisioning membuat database aplikasi.
Database `nist_basis` dibuat oleh `db:setup`; tidak perlu dibuat manual.
Jika role sudah ada, gunakan role tersebut dan sesuaikan izin/password.

### B3. Buat `.env`

Windows:

```powershell
Copy-Item env.exsample .env
notepad .env
```

Linux:

```bash
cp env.exsample .env
chmod 600 .env
nano .env
```

Nama template yang digunakan adalah **`env.exsample`** (tanpa titik di depan).
Jangan menimpa `.env` milik instalasi lama. Isi:

```dotenv
NODE_ENV=development
PORT=8000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nist_basis
DB_USER=nist_app
DB_PASSWORD="GANTI_DENGAN_PASSWORD_DARI_B2"
DB_SSL=false
```

Ganti password dengan nilai role `nist_app`, lalu simpan. Biarkan `DATABASE_URL`
tidak diisi untuk konfigurasi ini. Mode `development` digunakan untuk percobaan
lokal HTTP; untuk deployment produksi ikuti bagian D.

### B4. Instal dependency dan build frontend

Windows:

```powershell
npm.cmd ci
npm.cmd run build
```

Linux:

```bash
npm ci
npm run build
```

Tunggu setiap perintah selesai tanpa error. Jangan memakai `--omit=dev` sebelum
build karena Vite dan Tailwind diperlukan. `npm.cmd` pada Windows menghindari
masalah execution policy `npm.ps1`.

### B5. Siapkan database dan admin

`db:setup` membuat akun awal `admin` / `AdminInitial123!` dan
`user` / `UserInitial123!`, termasuk pada production. Perintah `admin:create`
di bawah opsional untuk membuat administrator tambahan dengan username baru.

Windows:

```powershell
npm.cmd run db:setup
npm.cmd run admin:create
```

Linux:

```bash
npm run db:setup
npm run admin:create
```

Pastikan provisioning selesai dan menampilkan tabel yang siap. Masukkan username
baru (default `nistadmin`), nama opsional, password, dan konfirmasinya.
Password wajib 8–72 karakter dengan huruf besar, huruf kecil, dan angka.
Gunakan akun awal atau administrator tambahan untuk login.

### B6. Jalankan aplikasi

Windows:

```powershell
npm.cmd start
```

Linux:

```bash
npm start
```

Startup melengkapi tabel dan data referensi. Tunggu server siap, lalu buka
**http://localhost:8000/login**. Login memakai akun dari B5.
**Segera ubah password akun `admin` dan `user`**
melalui **Account → Account Management**, isi password saat ini, password baru,
dan konfirmasi, lalu **Save profile**. Login kembali memakai password baru.
Password baru harus 8–72 karakter dengan huruf besar, huruf kecil, dan angka.
Jangan membuka akses kepada pengguna lain sebelum kedua password diganti.
Biarkan terminal terbuka selama server dipakai; `Ctrl+C` menghentikan aplikasi.
Ikuti pemeriksaan bagian C. Untuk start otomatis setelah reboot, gunakan
[systemd atau Task Scheduler](INSTALLATION.md#6-menjalankan-terus-menerus).

## C. Pemeriksaan setelah instalasi

1. Pastikan halaman login terbuka dan akun admin berhasil masuk.
2. Dari browser yang sudah login, buka `/api/health/db` pada URL aplikasi
   (contoh Docker: `http://localhost:5000/api/health/db`). Hasil harus memuat
   `connected: true`. Respons 401 berarti belum login.
3. Buka NIST CSF, Privacy, dan ISO; pastikan data referensi tampil.
4. Buka Risk Management; risk register baru boleh kosong.
5. Coba upload evidence dan buka kembali file tersebut.
6. Buat Database Backup dan unduh salinannya ke luar folder/volume aplikasi.

| Masalah | Langkah perbaikan |
| --- | --- |
| Docker tidak terhubung ke engine | Buka Docker Desktop; di Linux periksa service dan akses akun ke Docker. |
| `Set BLACKOWL_DB_PASSWORD` | Isi password dan sertakan `--env-file .env.docker` pada setiap perintah Compose. |
| Container restart atau tidak healthy | Periksa `docker compose --env-file .env.docker logs --tail 100 app db`. |
| Build gagal karena versi Node | Periksa versi Node, pasang 24, ulangi `npm ci` dan build. |
| PostgreSQL `ECONNREFUSED` | Periksa service PostgreSQL, host, dan port pada `.env`. |
| `password authentication failed` | Cocokkan password role database dengan konfigurasi; ini berbeda dari password login admin. |
| `permission denied to create database` | Pastikan role provisioning memiliki `CREATEDB`. |
| Port terpakai | Docker: ubah `BLACKOWL_PORT`, lalu `up -d`; manual: ubah `PORT`, lalu restart. |
| Username admin sudah terdaftar | Login memakai akun lama atau buat username admin baru. |
| Login berulang pada HTTP Docker | Untuk lokal, pastikan `BLACKOWL_COOKIE_SECURE=false`, lalu jalankan `up -d`. |
| Backup tidak menemukan tools | Instal PostgreSQL client tools; gunakan `PG_DUMP_PATH` dan `PG_RESTORE_PATH` bila perlu. |

## D. Akses server dan pemeliharaan

Untuk membuka aplikasi dari komputer lain melalui `192.168.130.12:5000`, ikuti
[panduan akses jaringan](NETWORK_ACCESS.md). Panduan mencakup Docker/manual,
firewall Windows/Linux, dan pemeriksaan TCP dari komputer pengguna.

Untuk produksi, gunakan reverse proxy HTTPS ke port lokal aplikasi, pertahankan
header Host asli, dan atur cookie Secure. Docker menggunakan
`BLACKOWL_COOKIE_SECURE=true`; manual menggunakan `NODE_ENV=production`.
Restart/recreate aplikasi setelah mengubah konfigurasi. Detail tersedia pada
[panduan manual HTTPS](INSTALLATION.md#7-deployment-https) dan
[konfigurasi Docker](DOCKER.md#konfigurasi-dan-penyimpanan).

Backup lengkap mencakup database, evidence/upload, `data/smtp-secret.key`, dan
konfigurasi environment. Database backup saja tidak membawa file evidence atau
kunci SMTP. Data instalasi manual tidak otomatis pindah ke Docker; ikuti
[panduan backup dan restore](database-backup.md) sebelum migrasi.

Perintah dan konfigurasi panduan dicocokkan dengan source proyek. Instalasi
bersih pada host baru perlu diverifikasi di lingkungan tujuan.
