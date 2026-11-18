# Pull versi terbaru dan perbaiki login Docker

Panduan untuk server yang sudah menjalankan aplikasi melalui Docker Compose,
contoh URL **https://192.168.130.12/login**. Jalankan dari terminal server,
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
pengamanan provisioning akun. Perubahan yang hanya ada di komputer pengembang belum dapat
ditarik oleh server sebelum di-commit dan di-push ke repository.

## 4. Periksa akses LAN

Edit `.env.docker` yang sudah ada, pertahankan password database:

```dotenv
BLACKOWL_BIND_IP=0.0.0.0
BLACKOWL_ADDRESS=192.168.130.12
```

Gunakan IP VM sebenarnya. Port publik menjadi 80/443 melalui Nginx;
BLACKOWL_PORT, BLACKOWL_TLS dan BLACKOWL_COOKIE_SECURE lama tidak lagi dipakai.
Ikuti [trust CA dan migrasi HTTPS](DOCKER_HTTPS.md).

## 5. Rebuild dan jalankan aplikasi terbaru

Jika build gagal dengan `Cannot find module '/app/scripts/lib/runtime-contracts.cjs'`,
pastikan Dockerfile menyalin `scripts/lib` pada tahap `build`, sebelum
`RUN npm run build && npm prune --omit=dev`:

```dockerfile
COPY scripts/lib ./scripts/lib
```

Folder ini berisi pemeriksa kontrak runtime dan helper manifest yang diperlukan
build frontend. Setelah memperbarui Dockerfile, ulangi build di bawah; container
yang sedang berjalan tidak perlu dihentikan selama build. Perbaikan ini tidak
memerlukan penghapusan volume atau restore database. Build container tetap harus
diverifikasi pada host Docker; build frontend lokal saja tidak membuktikan image berhasil.

```text
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker build --pull app nginx
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker logs --tail 100 nginx app db
```

Tunggu database healthy dan startup selesai. Hanya Nginx mempublikasikan
80/443; app/db tidak memiliki mapping port host.
`git pull` saja tidak memperbarui kode dalam image; `--build` diperlukan.
Startup menjalankan provisioning dan seed otomatis. Jangan gunakan `down -v`
atau menghapus volume: data lama tetap diperlukan.

### Jika browser menampilkan refused to connect setelah update

Jalankan dari folder repository di server Docker. Gunakan alamat
**https://192.168.130.12/login**, sesuaikan IP dengan VM sebenarnya.
Port lama `:5000` atau `:8000` tidak dipublikasikan pada konfigurasi sekarang.
Push ke repository saja tidak memperbarui container; server perlu pull dan rebuild.

Log `NIST CSF Express server: http://localhost:8000` menunjukkan backend
sudah mendengarkan di dalam container, tetapi belum membuktikan Nginx atau
akses HTTPS dari jaringan pengguna sudah tersedia. Jika log gabungan hanya
menampilkan app tanpa Nginx, periksa status semua container, termasuk yang berhenti:

```bash
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker up -d --build nginx
docker compose --env-file .env.docker logs --tail 80 nginx app
curl -kI https://127.0.0.1/login
```

Perintah `up` tersebut membuat atau menjalankan service Nginx beserta dependensinya
sesuai Compose, dengan volume lama tetap digunakan. Perhatikan error langsung
dari perintah itu; log Nginx dapat kosong jika container belum berhasil dibuat.
Nginx menunggu app healthy, dan app menunggu database healthy.

| Hasil pemeriksaan | Langkah berikutnya |
| --- | --- |
| App/database unhealthy atau exited | Periksa log app/db dan selesaikan error startup sebelum mengulang `up`. |
| Nginx exited/restarting | Periksa log Nginx untuk error konfigurasi atau sertifikat. |
| `up` gagal karena port 80/443 sudah dipakai | Identifikasi service pemilik port sebelum mengubah konfigurasi; jangan hentikan service lain tanpa mengetahui fungsinya. |
| Curl lokal mendapat respons HTTP, browser LAN tetap ditolak | Periksa mapping port Nginx pada `ps -a`, binding IP, IP VM, firewall dan routing sesuai [panduan jaringan](NETWORK_ACCESS.md). |
| Curl lokal juga connection refused | Periksa status Nginx dan publikasi port 443 terlebih dahulu. |

Opsi `-k` hanya untuk diagnosis sertifikat lokal pada perintah curl. Browser tetap
perlu mempercayai root CA sesuai [panduan HTTPS](DOCKER_HTTPS.md).
Respons HTTP lokal membuktikan listener HTTPS merespons, bukan keberhasilan login;
respons 502/503 memerlukan pemeriksaan koneksi Nginx ke backend.

Pesan `[policy-reminder] Pemeriksaan reminder gagal` perlu diperiksa terpisah
melalui konfigurasi database/SMTP; pesan itu saja tidak membuktikan penyebab
port HTTPS menolak koneksi. Jangan menghapus volume, mereset akun, atau restore
database untuk menangani masalah listener Nginx.

Setelah pulih, pastikan login dan workspace dapat dibuka dari perangkat pengguna.
Jika meminta bantuan, sertakan output `ps -a`, error `up`, dan log relevan yang
sudah disunting agar tidak memuat kredensial; jangan membagikan `.env.docker`.

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

Buka **https://192.168.130.12/login** dengan akun yang sudah ada.
Instalasi baru membuat admin / admin saat tabel akun kosong; segera ganti password. Akun lama tidak di-reset;
jika masih memakai password awal versi lama, ganti melalui Account Management.

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
2. Buka `https://192.168.130.12/api/health/db` dari browser yang sudah login;
   hasil harus memuat `connected: true`.
3. Periksa data lama, modul framework, dan file evidence masih tersedia.
4. Buat dan unduh backup setelah pembaruan berhasil.

Jika masih gagal, catat pesan login, hasil langkah 6, dan log aplikasi. Jangan
menyertakan password, isi `.env.docker`, hash password, atau token session.
Pada 16 November 2026, pengguna melaporkan login kembali berhasil setelah
diarahkan memeriksa dan menjalankan Nginx dengan langkah diagnosis di atas.
Log yang dibagikan menunjukkan backend berjalan, tetapi output status Nginx,
perintah pemulihan dan curl tidak dibagikan, sehingga akar penyebab belum
dipastikan. Agen tidak menjalankan Docker atau menguji server tersebut secara langsung.
