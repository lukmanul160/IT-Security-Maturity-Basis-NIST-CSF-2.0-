# NIST Basis

Aplikasi web untuk assessment keamanan, risk register, threat modelling,
policy, personel, evidence, serta pengelolaan risiko pihak ketiga. Backend
Express/Node.js memakai PostgreSQL; frontend Vue 3 dibangun melalui Vite dan
Tailwind, lalu disajikan oleh backend pada port default 8000.

## Dokumentasi

- [Instalasi Linux dan Windows](docs/INSTALLATION.md): prasyarat, PostgreSQL,
  environment, build, akun awal, systemd/Task Scheduler, HTTPS, upgrade,
  backup/restore, migrasi antar-OS, dan troubleshooting.
- [Panduan penggunaan](docs/USER_GUIDE.md): langkah penggunaan setiap modul.
- [Penyimpanan upload](docs/file-storage.md): pilihan lokal/NAS, AWS S3, Google Cloud Storage, dan kredensial server.
- [High-Level Design](docs/HIGH_LEVEL_DESIGN.md) dan
  [Low-Level Design](docs/LOW_LEVEL_DESIGN.md): arsitektur, data, dan API.
- [Catatan proyek](docs/PROJECT_LEARNING.md): lokasi kode dan alur inisialisasi.
- [Import/export/report](docs/module-import-export-report.md),
  [Database Backup](docs/database-backup.md),
  [Threat Modelling](docs/threat-modelling.md),
  [Pengelolaan pilihan risk](docs/risk-options.md),
  [Audit Finding Tracker](docs/audit-finding-tracker.md), dan
  [Policy reminder](docs/policy-email-reminders.md).

## Mulai cepat

Instal Node.js 24 LTS, PostgreSQL server beserta client tools, lalu buka root
project. Buat role database dan konfigurasikan kredensial sesuai panduan instalasi.
Template environment di repository bernama **env.exsample**. Jangan menimpa
file .env yang sudah dipakai pada instalasi lama.

Linux:

~~~bash
cp env.exsample .env
# Edit .env: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
npm ci
npm run build
npm run db:setup
npm run admin:create
npm start
~~~

Windows PowerShell:

~~~powershell
Copy-Item env.exsample .env
notepad .env
npm.cmd ci
npm.cmd run build
npm.cmd run db:setup
npm.cmd run admin:create
npm.cmd start
~~~

Buat akun administrator melalui perintah admin:create (username default
**nistadmin**, password dipilih sendiri), lalu login di http://localhost:8000/login.
Perintah menambahkan admin baru setelah db:setup; username harus belum terdaftar.
Mode production memakai cookie Secure, sehingga akses melalui HTTPS.

Startup/provisioning tetap memakai DB_* meskipun DATABASE_URL diisi. Gunakan
DB_* untuk instalasi sederhana, atau pastikan URL dan DB_* menunjuk target yang
sama. Build membutuhkan versi Node yang kompatibel dengan Vite; Node.js 18 pada
engine aplikasi tidak cukup untuk membangun frontend saat ini.

## Modul

- NIST CSF 2.0, NIST Privacy, dan ISO 27001 termasuk SOA serta sasaran keamanan.
- Risk Acceptance dan Risk Management dengan tab Pengelolaan Pilihan.
- Threat Modelling: diagram data flow, trust boundary, dan ancaman STRIDE.
- Policy Register, reminder, serta SMTP terpusat.
- Personnel Certification, organisasi, dan reference roadmap.
- TPRM, kuesioner, template, serta register risiko vendor.
- Audit Finding Tracker, Uploaded files, akun/permission, audit, dan backup.

## Operasi dan pengembangan

~~~bash
npm run dev
npm run dev:client
npm run build
npm test
npm run test:threat-browser
npm run test:risk-options-browser
~~~

Backend dan dev frontend dijalankan pada terminal terpisah. Perubahan frontend
memerlukan build; perubahan backend/config memerlukan restart. Session ada dalam
memori, sehingga pengguna login kembali setelah restart. Setiap akun hanya
memiliki satu sesi aktif: login berhasil dari browser/perangkat lain mengakhiri
sesi sebelumnya. Tab dalam browser yang sama berbagi sesi. Batas sesi ini
berlaku untuk satu proses backend; beberapa proses memerlukan session store bersama.

Database adalah sumber utama data operasional. Evidence berada di upload/ atau
storage tambahan; password SMTP terenkripsi memerlukan data/smtp-secret.key.
Backup PostgreSQL tidak menyertakan file evidence, kunci SMTP, atau konfigurasi
server. Ikuti panduan recovery untuk salinan lengkap. Workbook Risk Register
operasional tidak diperlukan untuk clone dan tidak boleh dimasukkan ke repository.
# Bahasa antarmuka / Interface language

Beranda, login, dan workspace menyediakan pilihan **Indonesia** dan **English** melalui pemilih **Bahasa / Language**. Preferensi disimpan pada browser dan digunakan ketika membuka halaman berikutnya. Bahasa awal adalah Indonesia.

Terjemahan antarmuka dikelola dalam `frontend/public/i18n.js` dan bekerja tanpa layanan terjemahan eksternal. Kamus mencakup navigasi serta label, tombol, placeholder, dan pesan antarmuka utama; teks yang belum tercantum dalam kamus tetap memakai bahasa sumber. Dokumen, isi kerangka kerja, data tabel pengguna, serta nilai formulir tidak diterjemahkan. Tambahkan pasangan `[teksIndonesia, teksEnglish]` untuk memperluas cakupan. Gunakan `data-no-translate` pada elemen yang harus mempertahankan teks aslinya.

Run `npm run test:i18n` to check language persistence, dynamic translation, and form/data preservation. Browser checks use installed Chrome (or `CHROME_PATH`). Run `npm run build:client` after changing the Vue entry point; the shared translation script is served directly.

Konten dashboard CSF, privasi, dan risiko mengikuti pilihan bahasa, termasuk ringkasan kematangan, penghitung kontrol, deskripsi fungsi, legenda tingkat kematangan, label ringkasan, dan label grafik radar. Label tabel ringkasan menggunakan `data-translate-ui`; data tabel lain tetap dipertahankan. Grafik radar digambar ulang ketika bahasa berubah tanpa mengubah skor atau target.

