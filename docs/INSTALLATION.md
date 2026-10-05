# Panduan instalasi NIST Basis: Linux dan Windows

Panduan disesuaikan dengan source aplikasi pada 2 Oktober 2026. Perintah dijalankan
dari root repository, yaitu folder yang berisi `package.json`, kecuali disebutkan
lain. Instalasi Linux di bawah memakai Ubuntu/Debian dengan systemd; distribusi
lain perlu menyesuaikan package manager dan service PostgreSQL.

## Pilih metode deployment

Panduan di bawah khusus **instalasi langsung tanpa Docker**, dengan Node.js dan
PostgreSQL dipasang pada host. Sebagai alternatif, gunakan
[deployment Docker Compose](DOCKER.md): cukup pasang Docker dengan Compose v2;
Node.js, npm, build frontend, PostgreSQL, dan client tools berjalan di container.
Pengguna Docker tidak perlu mengikuti langkah instalasi Node.js/PostgreSQL di
bawah. Kedua metode tersedia sebagai pilihan deployment aplikasi yang sama.

## 1. Kebutuhan instalasi langsung

| Komponen | Kebutuhan |
| --- | --- |
| Node.js | Gunakan Node.js **24** beserta npm. Engine aplikasi dan Vite 7 memerlukan `^20.19.0 || >=22.12.0`; Node.js 18 tidak cukup untuk build. |
| PostgreSQL | Server PostgreSQL dan client tools `psql`, `pg_dump`, `pg_restore`. Lingkungan pengembangan memakai PostgreSQL 18. |
| Source aplikasi | Clone Git atau ekstrak arsip lengkap, termasuk `data/`, `database/`, `scripts/`, dan `frontend/`. |
| Browser | Browser modern untuk login, upload evidence, dan editor diagram SVG. |
| Hak folder | Akun yang menjalankan Node.js perlu akses tulis ke `upload/`, `backup/`, dan `data/` untuk kunci SMTP. |
| Jaringan | Akses database (default 5432), aplikasi (default 8000), dan internet saat mengunduh dependency. |

Unduh dari [Node.js resmi](https://nodejs.org/en/download),
[PostgreSQL Windows](https://www.postgresql.org/download/windows/), atau gunakan
[paket PostgreSQL Ubuntu](https://www.postgresql.org/download/linux/ubuntu/).
Persyaratan build dapat diperiksa di `node_modules/vite/package.json` setelah
dependency diinstal; lihat juga [panduan Vite](https://vite.dev/guide/).

## 2. Instalasi Linux (Ubuntu/Debian)

### 2.1. PostgreSQL dan utilitas

```bash
sudo apt update
sudo apt install -y postgresql postgresql-client git curl ca-certificates xz-utils
sudo systemctl enable --now postgresql
psql --version
pg_dump --version
pg_restore --version
```

Versi PostgreSQL mengikuti repository distribusi. Jika membutuhkan versi 18,
ikuti konfigurasi repository APT resmi pada tautan PostgreSQL Ubuntu di atas,
lalu instal server dan client dengan versi yang sama. `pg_dump` tidak boleh
lebih tua daripada major version server yang dicadangkan.

### 2.2. Node.js 24 LTS

Jika Node.js 24 sudah tersedia, cukup verifikasi `node --version` dan
`npm --version`. Berikut contoh instalasi binary resmi untuk x64/ARM64 dengan
versi 24.21.0 yang tersedia saat dokumentasi disusun:

```bash
NODE_VERSION=v24.21.0
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "Pilih binary sesuai arsitektur dari nodejs.org"; exit 1 ;;
esac
node_install_dir=$(mktemp -d)
cd "$node_install_dir"
curl --fail --location --output "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
  "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
curl --fail --location --output SHASUMS256.txt \
  "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
awk -v file="node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" '$2 == file' SHASUMS256.txt | sha256sum --check -
```

Lanjutkan hanya jika pemeriksaan menampilkan `OK`:

```bash
sudo mkdir -p /opt/nodejs
sudo tar -xJf "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /opt/nodejs
sudo ln -sfn "/opt/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/node" /usr/local/bin/node
sudo ln -sfn "/opt/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npm" /usr/local/bin/npm
sudo ln -sfn "/opt/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npx" /usr/local/bin/npx
node --version
npm --version
```

Jika organisasi menyediakan Node.js melalui package manager internal, gunakan
instalasi tersebut dengan versi yang memenuhi kebutuhan build.

### 2.3. Role database

```bash
sudo -u postgres psql -d postgres
```

Di prompt SQL, untuk instalasi baru:

```sql
CREATE ROLE nist_app WITH LOGIN CREATEDB;
\password nist_app
\q
```

Masukkan password database saat diminta. Role aplikasi dan akun login aplikasi
adalah dua hal berbeda. Role `nist_app` dipakai `.env`; akun admin aplikasi akan
dibuat pada langkah provisioning. `CREATEDB` diperlukan saat database belum ada.
Startup tetap membutuhkan koneksi ke database maintenance `postgres`, meskipun
database aplikasi sudah tersedia. Jika role sudah ada, gunakan role tersebut
dan pastikan izin serta password sesuai; jangan mengulangi `CREATE ROLE`.

### 2.4. Source, konfigurasi, dan build

Ganti `URL_REPOSITORY` dengan URL repository sebenarnya. Jika source sudah
tersedia, langsung masuk ke foldernya. Jangan menyalin `node_modules` Windows
ke Linux; instal dependency pada OS tujuan.

```bash
mkdir -p "$HOME/apps"
cd "$HOME/apps"
git clone URL_REPOSITORY nist-basis
cd nist-basis
cp env.exsample .env
chmod 600 .env
nano .env
```

Nama template di repository memang **`env.exsample`**. Isi `.env` sesuai bagian
konfigurasi di bawah. Setelah disimpan:

```bash
npm ci
npm run build
npm run db:setup
npm run admin:create
npm start
```

`npm ci` menggunakan `package-lock.json`; dependency build tetap diperlukan,
sehingga jangan memakai `--omit=dev` sebelum build. Buka
`http://localhost:8000/login`. Untuk server jarak jauh, gunakan alamat server
sesuai jaringan yang diizinkan. Hentikan proses foreground dengan `Ctrl+C`.

## 3. Instalasi Windows (PowerShell)

### 3.1. Prasyarat dan database

1. Instal **Node.js 24 LTS** memakai installer `.msi` resmi dan aktifkan PATH.
2. Instal **PostgreSQL**, termasuk server dan command line tools. Catat password
   role `postgres` serta port saat instalasi.
3. Instal Git jika akan melakukan clone. Tutup dan buka kembali PowerShell
   setelah instalasi agar PATH baru terbaca.

```powershell
node --version
npm.cmd --version
Get-Service *postgresql*
```

Jika service belum berjalan, buka **Services** dan start service PostgreSQL.
Untuk membuat role khusus aplikasi (contoh path versi 18):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -d postgres
```

Di prompt SQL:

```sql
CREATE ROLE nist_app WITH LOGIN CREATEDB;
\password nist_app
\q
```

Sesuaikan angka `18` dengan versi terpasang. Jika role sudah ada, gunakan role
yang tersedia; ketentuan izin sama seperti bagian Linux.

### 3.2. Source, konfigurasi, dan build

```powershell
New-Item -ItemType Directory -Path 'C:\Apps' -Force | Out-Null
Set-Location 'C:\Apps'
git clone URL_REPOSITORY NISTBasis
Set-Location 'C:\Apps\NISTBasis'
Copy-Item -LiteralPath 'env.exsample' -Destination '.env'
notepad .env
```

Jika folder project sudah tersedia, gunakan `Set-Location` ke folder tersebut.
Perintah `Copy-Item` adalah untuk instalasi baru; pada upgrade, pertahankan `.env`
yang sudah berisi konfigurasi. Setelah `.env` disimpan:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run db:setup
npm.cmd run admin:create
npm.cmd start
```

Gunakan `npm.cmd` agar tidak bergantung pada execution policy `npm.ps1`.
Buka `http://localhost:8000/login`. Jangan tutup terminal selama memakai
foreground server. `Ctrl+C` menghentikan server.

## 4. Konfigurasi `.env`

Konfigurasi awal untuk kedua OS:

```dotenv
NODE_ENV=development
PORT=8000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nist_basis
DB_USER=nist_app
DB_PASSWORD=GANTI_DENGAN_PASSWORD_ROLE_DATABASE
DB_SSL=false
```

| Variabel | Fungsi |
| --- | --- |
| `NODE_ENV` | `development` untuk instalasi lokal HTTP; `production` untuk deployment HTTPS. Buat admin melalui admin:create pada kedua mode. |
| `PORT` | Port HTTP Express; default 8000. |
| `DB_HOST`, `DB_PORT` | Host dan port PostgreSQL. |
| `DB_NAME` | Database aplikasi; default `nist_basis`. |
| `DB_USER`, `DB_PASSWORD` | Role PostgreSQL dan passwordnya. |
| `DB_SSL` | `true` jika PostgreSQL membutuhkan TLS. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Default `true`; memverifikasi sertifikat database. |
| `DB_SSL_CA` | Isi sertifikat CA jika diperlukan untuk koneksi database. |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Path executable client tools untuk backup/restore jika pencarian otomatis/PATH tidak sesuai. |
| `DATABASE_URL` | Connection string opsional pada pool aplikasi dan client tools. Saat ini provisioning/startup tetap memakai `DB_*`; jika URL digunakan, kedua konfigurasi harus menunjuk database dan role yang sama. |

Untuk instalasi sederhana, gunakan `DB_*` dan biarkan `DATABASE_URL` tidak diisi.
Password dengan `#` atau spasi dapat ditulis dalam tanda kutip pada `.env`.
Pengaturan SMTP dikonfigurasi lewat **Account → SMTP**; tidak perlu menambahkan
SMTP host/password ke `.env`.

Linux, jika tools tidak berada di PATH:

```dotenv
PG_DUMP_PATH=/usr/bin/pg_dump
PG_RESTORE_PATH=/usr/bin/pg_restore
```

Windows, gunakan slash agar path mudah disalin:

```dotenv
PG_DUMP_PATH=C:/Program Files/PostgreSQL/18/bin/pg_dump.exe
PG_RESTORE_PATH=C:/Program Files/PostgreSQL/18/bin/pg_restore.exe
```

Aplikasi juga mencari tools dalam `Program Files/PostgreSQL` pada Windows.
Gunakan versi tools yang sesuai dengan server. Perubahan `.env` membutuhkan
restart backend.

## 5. Login awal dan verifikasi

Setelah `db:setup`, jalankan perintah setup admin dari terminal interaktif:

```bash
npm run admin:create
```

Windows memakai `npm.cmd run admin:create`. Masukkan username yang belum
terdaftar (default `nistadmin`), nama lengkap opsional, password, dan konfirmasi.
Password ditampilkan sebagai bintang dan wajib 8–72 karakter, memuat huruf besar,
huruf kecil, dan angka. Perintah memakai validator serta bcrypt aplikasi dan
menambahkan akun role admin; username duplikat ditolak.

Login melalui `/login` memakai akun tersebut, lalu kelola akun/izin melalui
**Account**. Pada instalasi lama, gunakan akun admin yang sudah berfungsi atau
buat admin baru dengan username berbeda. SQL historis memuat seed akun demo;
hash admin pada source yang diperiksa tidak cocok dengan password `admin`
di README lama, sehingga panduan ini memakai setup admin eksplisit. Kelola/hapus
akun demo yang tidak dipakai melalui Account Management.

Pada `NODE_ENV=production`, seed akun default tidak dijalankan. `admin:create`
tetap bekerja setelah `db:setup`, sehingga admin dapat dibuat sebelum server
produksi pertama kali dijalankan.

Setelah login, buka `http://localhost:8000/api/health/db` di browser yang sama.
Hasil sukses memuat `connected: true`. HTTP 401 berarti belum login, bukan
database gagal. Verifikasi juga:

- NIST CSF, Privacy, dan ISO menampilkan data referensi.
- Risk Management menampilkan tab **Pengelolaan Pilihan**; buat pilihan sebelum
  memasukkan risk baru. Risk register awal memang kosong.
- Threat Modelling dapat membuka **Example diagram** lalu menyimpan diagram.
- Upload evidence, buka kembali berkas tersebut, dan buat Database Backup.

`npm run db:setup` membuat database, schema dasar, seed akun historis pada mode
development, dan katalog
sertifikasi. `npm start` melengkapi inisialisasi framework, indikator risiko,
permission, tabel pendukung, dan scheduler. Startup menulis ke database; lakukan
backup sebelum menjalankan versi baru pada data operasional.

## 6. Menjalankan terus-menerus

### Linux dengan systemd

Contoh berikut menggunakan user OS khusus `nistbasis`, directory aplikasi
`/opt/nist-basis`, dan Node.js di `/usr/local/bin/node`. Letakkan source dan hasil
build di directory tersebut, siapkan `.env`, serta berikan kepemilikan/izin
folder yang sesuai kepada user ini. Jika memakai directory lain, sesuaikan unit.

```bash
sudo useradd --system --user-group --home-dir /opt/nist-basis --shell /usr/sbin/nologin nistbasis
sudo mkdir -p /opt/nist-basis
sudo chown nistbasis:nistbasis /opt/nist-basis
```

Jalankan `useradd` hanya jika user belum ada. Salin seluruh source aplikasi,
hasil build, dependency OS tujuan, dan `.env` ke `/opt/nist-basis`; beri akses
tulis kepada `nistbasis` untuk `upload/`, `backup/`, `data/`, serta folder storage
tambahan jika dipakai. Pada directory khusus instalasi ini, contoh penyiapan
kepemilikan dan dependency (setelah source disalin):

```bash
sudo chown -R nistbasis:nistbasis /opt/nist-basis
sudo -u nistbasis sh -c 'cd /opt/nist-basis && npm ci && npm run build'
sudo chmod 600 /opt/nist-basis/.env
```

Buat `/etc/systemd/system/nist-basis.service`:

```ini
[Unit]
Description=NIST Basis application
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=nistbasis
Group=nistbasis
WorkingDirectory=/opt/nist-basis
ExecStart=/usr/local/bin/node /opt/nist-basis/src/server.js
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
```

`.env` dibaca oleh dotenv dari `WorkingDirectory`; gunakan file tersebut sebagai
sumber konfigurasi, termasuk `NODE_ENV`. Kemudian:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nist-basis
sudo systemctl status nist-basis
sudo journalctl -u nist-basis -n 100 --no-pager
```

Perintah operasional: `sudo systemctl restart nist-basis` untuk restart dan
`sudo systemctl stop nist-basis` untuk berhenti. Referensi:
[systemd service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).

### Windows dengan Task Scheduler

Untuk auto-start tanpa terminal manual, buat task **NIST Basis** di Task Scheduler:

| Pengaturan | Isi contoh |
| --- | --- |
| Trigger | At startup |
| Program/script | `C:\Program Files\nodejs\node.exe` |
| Arguments | `"C:\Apps\NISTBasis\src\server.js"` |
| Start in | `C:\Apps\NISTBasis` |
| Akun menjalankan task | Akun Windows khusus yang dapat membaca source/.env dan menulis storage aplikasi |
| Mode | Run whether user is logged on or not, sesuai kebijakan akun organisasi |
| Jika gagal | Restart task sesuai interval organisasi |
| Jika task sudah berjalan | Do not start a new instance |
| Batas waktu | Nonaktifkan batas waktu otomatis untuk proses server yang berjalan terus-menerus |

Pastikan PostgreSQL memakai startup otomatis. Jangan menjalankan `npm start`
dan task bersamaan pada port yang sama. Gunakan **Run/End** di Task Scheduler
untuk menjalankan/menghentikan task; setelah pembaruan, End lalu Run. Folder
share harus dapat diakses akun task, bukan hanya akun desktop; gunakan UNC,
bukan drive mapping milik sesi login lain. Referensi:
[Scheduled Tasks Microsoft](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask).

## 7. Deployment HTTPS

Selesaikan bootstrap akun lokal, ubah password admin, lalu atur
`NODE_ENV=production` sebelum deployment. Mode ini memakai cookie login
`Secure`, sehingga akses aplikasi melalui HTTPS; login lewat HTTP biasa dapat
kembali ke halaman login.

Gunakan reverse proxy HTTPS sesuai infrastruktur organisasi (misalnya Nginx
atau IIS) menuju `http://127.0.0.1:8000`. Pertahankan header **Host** dari request
browser. Aplikasi memeriksa kesamaan Origin dan Host pada request tulis, sehingga
Host yang diganti menjadi `127.0.0.1:8000` dapat menghasilkan `Invalid request
origin`. Konfigurasikan batas body proxy sesuai kebutuhan upload. Server Express
tidak menyediakan sertifikat atau listener HTTPS sendiri.

Session saat ini disimpan dalam memori: restart meminta login kembali. Jalankan
satu instance aplikasi; cluster memerlukan penyimpanan session bersama yang
belum disediakan aplikasi.

## 8. Pembaruan aplikasi

1. Buat backup database dan salinan evidence serta kunci SMTP.
2. Hentikan server/systemd/task agar scheduler tidak berjalan selama pembaruan.
3. Perbarui source menggunakan release atau commit yang dipilih. Pertahankan
   `.env`, `upload/`, `backup/`, `data/smtp-secret.key`, dan storage tambahan.
4. Dari root project, jalankan `npm ci` lalu `npm run build` (Windows: `npm.cmd`).
5. Jalankan kembali server; startup menjalankan provisioning/migrasi yang tersedia.
6. Login kembali, refresh browser, dan periksa health serta modul utama.

Perubahan frontend memerlukan build; perubahan backend/config memerlukan
restart. Jangan menjalankan `git reset --hard` atau menimpa `.env` untuk update.

## 9. Backup, restore, dan pindah OS

**Database Backup** menghasilkan PostgreSQL custom dump untuk seluruh database
aplikasi: semua tabel/schema, data, sequence, index, constraint, view, dan fungsi
yang termasuk dalam dump. Termasuk Threat Modelling dan pilihan Risk Management.
Backup ini bukan seluruh cluster PostgreSQL dan tidak membawa role global.

Recovery lengkap juga memerlukan:

- `upload/` dan semua folder evidence/storage tambahan; lokasinya dapat dilihat
  di Uploaded files → pengaturan storage.
- `data/smtp-secret.key` untuk mendekripsi password SMTP yang tersimpan.
- `.env` atau konfigurasi setara pada server baru; sesuaikan host/password/path.

Restore melalui **Database Backup → Select backup file → Restore selected
backup** mengganti isi database tujuan. Jadwalkan saat tidak ada penulisan
pengguna/scheduler dan simpan backup sebelum restore. Dump dipulihkan dalam satu
transaksi. Snapshot JSON lama membutuhkan schema yang sudah tersedia dan dapat
memerlukan hak superuser karena implementasi restore mematikan trigger melalui
`session_replication_role`; untuk instalasi baru gunakan `.dump` lengkap.

Saat pindah Windows/Linux: instal dependency ulang di OS tujuan, pulihkan dump
ke PostgreSQL yang kompatibel, salin evidence dan kunci SMTP, lalu sesuaikan
path storage yang tersimpan. Path absolut/UNC Windows tidak berlaku di Linux.
Gunakan role database yang cocok dengan pemilik objek pada dump. Jika role
pemilik berbeda, DBA dapat melakukan restore manual dengan `--no-owner --no-acl`
dan menetapkan izin target sesuai kebutuhan. Lihat [detail backup](database-backup.md).

## 10. Troubleshooting

| Gejala | Pemeriksaan / tindakan |
| --- | --- |
| `npm.ps1 cannot be loaded` | Gunakan `npm.cmd` di PowerShell. |
| `EBADENGINE`, `crypto.hash is not a function` saat build | Periksa `node --version`; gunakan Node.js 24 LTS, lalu ulangi `npm ci` dan build. |
| `ECONNREFUSED` PostgreSQL | Periksa service, `DB_HOST`, `DB_PORT`, serta jaringan database. |
| `password authentication failed` | Cocokkan password role dengan `.env`; `DB_PASSWORD` bukan password akun aplikasi. |
| `permission denied to create database` | Berikan CREATEDB pada role provisioning atau minta DBA membuat database aplikasi dengan owner role tersebut. |
| Target database berbeda / data tidak terlihat | Pastikan `DATABASE_URL` tidak menunjuk target berbeda dari `DB_*`. |
| `relation ... does not exist` | Jalankan dari root project dan pastikan startup terbaru berhasil menginisialisasi seluruh service. |
| UI belum berubah / tombol Threat Modelling nonaktif | Build frontend, restart backend terbaru, login kembali, lalu Ctrl+F5. Pesan load error dapat dicoba ulang melalui Coba lagi. |
| Login kembali terus pada production | Gunakan HTTPS karena cookie session memakai Secure. |
| `Invalid request origin` | Pertahankan Host asli pada reverse proxy, termasuk port bila ada. |
| `EADDRINUSE` | Ada server lain pada port tersebut; hentikan instance aplikasi duplikat atau ubah `PORT`. |
| `EACCES` / gagal upload | Akun server harus memiliki izin baca/tulis/hapus pada folder storage. |
| `pg_dump`/`pg_restore` tidak tersedia | Instal client tools atau isi `PG_DUMP_PATH`/`PG_RESTORE_PATH`. Backup tidak lagi fallback ke JSON parsial. |
| `server version mismatch` | Gunakan client tools sesuai major version PostgreSQL server. |
| SMTP gagal setelah migrasi | Pulihkan `data/smtp-secret.key` dari server asal atau isi ulang password SMTP lewat Account → SMTP. |

## 11. Pengembangan dan pengujian

```bash
npm run dev
npm run dev:client
npm run build
npm test
```

Jalankan backend dan Vite pada terminal terpisah bila memakai dev:client.
Backend default 8000; Vite default 5173 dan mem-proxy `/api` ke 8000. Jika port
backend berubah, sesuaikan `frontend/client/vite.config.js` untuk dev server.

Tes fitur tertentu:

```bash
node --test test/moduleTransfer.test.js test/backupService.test.js test/threatModelService.test.js test/riskDropdownService.test.js
npm run test:threat-browser
npm run test:risk-options-browser
```

Tes browser baru memerlukan PostgreSQL, akun admin yang sudah ada, Chrome,
serta izin membuat schema sementara; gunakan database pengujian. Pada Linux
set `CHROME_PATH` ke executable Chrome/Chromium yang terpasang. Script browser
memakai default path Chrome Windows jika variabel tersebut tidak disetel.
Tes browser umum `npm run test:browser` membutuhkan server berjalan, `APP_URL`,
`BROWSER_TEST_USER`, dan `BROWSER_TEST_PASSWORD` yang sesuai akun pengujian.

Validasi dokumentasi ini: konfigurasi, perintah npm, path, dan perilaku startup
dicocokkan dengan source; build Windows dan tes fitur telah berjalan pada sesi
pengembangan. Instalasi Linux, systemd, Task Scheduler, dan proxy HTTPS perlu
diverifikasi pada host tujuan; panduan tidak menyatakan semuanya telah diuji.
