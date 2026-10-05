# Pull versi terbaru dan perbaiki login Docker

Panduan untuk server yang sudah menjalankan aplikasi melalui Docker Compose,
contoh URL **http://192.168.130.12:5000/login**. Jalankan dari terminal server,
bukan komputer pengguna. Pertahankan database dan volume lama.

## 1. Masuk ke folder repository dan periksa perubahan

Windows, sesuaikan lokasi aplikasi:

```powershell
Set-Location 'C:\Apps\NISTBasis'
```

Linux, sesuaikan lokasi aplikasi:

```bash
cd /lokasi/nist-basis
```

Periksa:

```text
git status --short
git branch --show-current
git remote -v
```

Jika folder bukan clone Git, perbarui source dari repository/release yang sama
atau clone ke folder baru terlebih dahulu. Jangan menghapus source lama,
konfigurasi, atau data untuk memperbaiki login.

Jika ada perubahan lokal pada file source yang akan diperbarui, simpan salinan
atau commit perubahan yang diperlukan dan selesaikan konflik sebelum pull.
Jangan menggunakan `git reset --hard` atau `git clean` untuk melewati masalah.

## 2. Simpan konfigurasi dan backup data

Pertahankan `.env.docker`, password database, dan nama project Compose
`it_governance_blackowl`. Jangan menyalin ulang `docker.env.example` ke
`.env.docker` milik instalasi lama.

Jika login masih bisa dilakukan, buat Database Backup dan File Backup dari
aplikasi, lalu unduh ke luar Docker. Jika login tidak bisa, backup database
dapat dibuat lewat container:

```text
docker compose --env-file .env.docker exec db pg_dump -U blackowl -d BlackOwl_DB_Gov -Fc -f /tmp/blackowl-before-update.dump
docker compose --env-file .env.docker cp db:/tmp/blackowl-before-update.dump ./blackowl-before-update.dump
```

Gunakan nama file berbeda jika backup dengan nama tersebut sudah ada.
Periksa file berhasil tersalin. Dump database perlu dilengkapi salinan evidence,
kunci SMTP, dan konfigurasi sesuai [panduan backup](database-backup.md).

## 3. Pull versi terbaru

Untuk deployment dari branch `main` pada remote `origin`:

```text
git switch main
git pull --ff-only origin main
git log -1 --oneline
```

Sesuaikan branch/remote dengan sumber deployment sebenarnya. Jika pull gagal,
selesaikan pesan Git sebelum melanjutkan; jangan rebuild source yang belum
berhasil diperbarui. Pastikan commit terbaru memang sudah memuat perubahan
seed akun awal. Perubahan yang hanya ada di komputer pengembang belum dapat
ditarik oleh server sebelum di-commit dan di-push ke repository.

## 4. Periksa akses LAN

Edit `.env.docker` yang sudah ada. Untuk pengujian HTTP jaringan internal:

```dotenv
BLACKOWL_BIND_IP=0.0.0.0
BLACKOWL_PORT=5000
BLACKOWL_COOKIE_SECURE=false
```

Pertahankan `BLACKOWL_DB_PASSWORD` yang lama. Jika memakai HTTPS, gunakan
cookie Secure sesuai konfigurasi reverse proxy. Detail firewall dan jaringan
tersedia pada [panduan akses LAN](NETWORK_ACCESS.md).

## 5. Rebuild dan jalankan aplikasi terbaru

```text
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 app db
```

Tunggu database healthy dan startup selesai. Port aplikasi harus menampilkan
`0.0.0.0:5000->8000/tcp` jika memakai konfigurasi LAN di atas.
`git pull` saja tidak memperbarui kode dalam image; `--build` diperlukan.
Startup menjalankan provisioning dan seed otomatis. Jangan gunakan `down -v`
atau menghapus volume: data lama tetap diperlukan.

## 6. Periksa koneksi database dari aplikasi

Perintah ini menggunakan pool dan konfigurasi yang sama dengan login aplikasi,
serta hanya menampilkan username/role, tanpa password atau hash:

```text
docker compose --env-file .env.docker exec app node -e "const {pool}=require('./src/config/database'); pool.query('SELECT username, role FROM app_users ORDER BY username').then(r=>console.table(r.rows)).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end())"
```

Jika muncul daftar akun, aplikasi berhasil terhubung dan membaca tabel akun.
Jika error koneksi muncul, periksa log startup dan pengaturan Docker; aplikasi
harus terhubung ke `db:5432`, database `BlackOwl_DB_Gov`, role `blackowl`.
Password database pada volume lama harus cocok dengan `.env.docker`.

## 7. Login atau buat administrator pemulihan

Buka **http://192.168.130.12:5000/login**. Untuk akun baru yang dibuat seed:

| Username | Password awal |
| --- | --- |
| `admin` | `AdminInitial123!` |
| `user` | `UserInitial123!` |

**Akun lama tidak di-reset oleh seed.** Jika username sudah ada, gunakan password
lamanya. Pesan `Username atau password salah` dapat terjadi karena password
lama berbeda atau akun tidak ditemukan, meskipun koneksi database berhasil.

Jika password lama tidak diketahui, buat administrator baru melalui terminal
interaktif:

```text
docker compose --env-file .env.docker exec app npm run admin:create
```

Masukkan username yang belum terdaftar, misalnya `adminpemulihan`, nama opsional,
password pilihan sendiri, dan konfirmasinya. Password harus 8–72 karakter,
maksimal 72 byte, memuat huruf besar, huruf kecil, dan angka.
Jangan memakai username `admin` jika sudah terdaftar.

Login memakai akun baru, buka **Account → ADMINISTRATION**, edit akun `admin`
dan `user`, isi password baru, lalu **Save user**. Pastikan password baru
berfungsi. Untuk mengganti password akun yang sedang digunakan, gunakan
**Account → Account Management → Save profile**.

Segera ganti password awal kedua akun sebelum memberi akses kepada pengguna
lain. Jika terlalu banyak percobaan gagal, tunggu 15 menit sebelum mencoba
kembali akun yang diblokir sementara.

## 8. Verifikasi hasil

1. Login berhasil dan workspace terbuka.
2. Buka `http://192.168.130.12:5000/api/health/db` dari browser yang sudah login;
   hasil harus memuat `connected: true`.
3. Periksa data lama, modul framework, dan file evidence masih tersedia.
4. Buat dan unduh backup setelah pembaruan berhasil.

Jika masih gagal, catat pesan login, hasil langkah 6, dan log aplikasi. Jangan
menyertakan password, isi `.env.docker`, hash password, atau token session.
Panduan ini belum dijalankan pada server `192.168.130.12` dari sesi ini.
