# NIST CSF 2.0 Maturity Assessment

## Instalasi dan Menjalankan Aplikasi

### Prasyarat

- Node.js 18 atau lebih baru. Lingkungan pengembangan saat dokumentasi ini dibuat menggunakan Node.js `v24.19.0`.
- PostgreSQL yang sedang berjalan. Lingkungan pengembangan menggunakan PostgreSQL `18.6` untuk Windows.
- Git untuk clone repository (opsional bila project sudah tersedia secara lokal).

`psql` tidak wajib tersedia di `PATH`; provisioning database dilakukan oleh script Node.js melalui package `pg`. Pastikan user PostgreSQL yang dipakai mempunyai akses ke database maintenance `postgres` dan izin membuat database.

### Langkah Instalasi di Windows (PowerShell)

1. Clone repository atau buka folder project, lalu masuk ke root project:

  ```powershell
  git clone <URL_REPOSITORY> "NIST Basis"
  Set-Location "NIST Basis"
  ```

2. Instal dependency Node.js:

  ```powershell
  npm install
  ```

3. Buat file environment dari template yang tersedia:

  ```powershell
  Copy-Item env.exsample .env
  ```

4. Sesuaikan `.env` dengan kredensial PostgreSQL lokal. Contoh konfigurasi default:

  ```dotenv
  PORT=8000
  DB_HOST=localhost
  DB_PORT=5432
  DB_NAME=nist_basis
  DB_USER=postgres
  DB_PASSWORD=isi_password_postgres_anda
  DB_SSL=false
  ```

  Alternatifnya, gunakan `DATABASE_URL` dan hapus atau abaikan variabel `DB_*`:

  ```dotenv
  DATABASE_URL=postgresql://postgres:password@localhost:5432/nist_basis
  ```

5. Jalankan provisioning awal. Perintah ini membuat database bila belum ada, menerapkan schema, membuat akun awal, dan menyiapkan seed sertifikasi:

  ```powershell
  npm run db:setup
  ```

6. Jalankan aplikasi:

  ```powershell
  npm start
  ```

  Buka [http://localhost:8000](http://localhost:8000) setelah terminal menampilkan alamat server. Saat startup, aplikasi juga memastikan folder `upload/`, data framework/control, indikator risiko, dan tabel pendukung tersedia.

### Perintah Pengembangan

```powershell
# Jalankan server dengan restart otomatis saat source berubah
npm run dev

# Bangun ulang CSS Tailwind setelah mengubah src/tailwind.css
npm run build:css

# Bangun ulang data seed sertifikasi dari sumber roadmap
npm run seed:personnel-certifications
```

### Verifikasi Instalasi

Pastikan service PostgreSQL berjalan, lalu setelah menjalankan server buka endpoint berikut:

```text
http://localhost:8000/api/health/db
```

Endpoint tersebut memerlukan login. Masuk terlebih dahulu menggunakan akun default, kemudian akses endpoint dari browser pada sesi yang sama. Respons berhasil memuat `"connected": true`.

### Troubleshooting PostgreSQL

Jangan menjalankan `psql -U postgres -d nist_basis -f database\schema.sql` pada clone baru sebelum database `nist_basis` dibuat. Perintah tersebut akan gagal bila database belum ada. Gunakan perintah berikut dari root project sebagai solusi utama:

```powershell
npm run db:setup
```

Jika user PostgreSQL tidak memiliki izin membuat database melalui aplikasi, minta administrator database untuk membuatnya atau jalankan fallback manual ini. Perintah pertama harus terhubung ke database maintenance `postgres`, bukan `nist_basis`:

```powershell
psql -U postgres -d postgres -f database\create-database.sql
psql -U postgres -d nist_basis -f database\schema.sql
psql -U postgres -d nist_basis -f database\users.sql
```

Masalah umum:

- `database "nist_basis" does not exist`: jalankan `npm run db:setup` atau perintah `create-database.sql` di atas terlebih dahulu.
- `password authentication failed`: perbarui `DB_USER` dan `DB_PASSWORD` pada `.env` sesuai akun PostgreSQL lokal.
- `ECONNREFUSED` atau koneksi ditolak: mulai service PostgreSQL melalui Windows Services, kemudian pastikan `DB_HOST` dan `DB_PORT` sesuai instalasi Anda.
- `npm.ps1 cannot be loaded`: PowerShell membatasi execution policy. Jalankan perintah sebagai `npm.cmd run db:setup` dan `npm.cmd start`, atau buka PowerShell dengan execution policy yang diizinkan oleh kebijakan organisasi.

## Clone dan Data Risiko

Data referensi framework/control yang diperlukan untuk menjalankan assessment disimpan di repository:

- `data/csf-data.json` untuk NIST CSF 2.0 Core.
- `data/privacy-data.json` untuk Privacy Framework Core clone-safe.
- `data/risk-indicators.json` untuk seed indikator tanpa membawa Risk Register.
- Seed schema dan akun aplikasi di `database/`.

`Cybersecurity Risk Register.xlsx` adalah data operasional dan tidak boleh di-commit atau di-upload ke GitHub. File tersebut diabaikan oleh `.gitignore`. Jika workbook risk diperlukan, letakkan secara lokal di root project setelah clone. Tanpa workbook tersebut aplikasi tetap dapat dijalankan; Risk Register akan mulai kosong dan dapat diisi melalui UI.

Ringkasan perintah setelah clone:

```powershell
npm install
Copy-Item env.exsample .env
npm run db:setup
npm start
```

`db:setup` membuat database, tabel, dan akun awal; `npm start` menginisialisasi framework/control CSF dan Privacy serta indikator risk dari file repository. `Risk Register`, `Risk Acceptance`, dan opsi dropdown risk tidak pernah di-seed dari workbook atau repository; tabel tersebut dibuat kosong pada clone baru dan hanya dapat diisi melalui aplikasi di database lokal.

Data `Security-Certification-Roadmap9.html` dipetakan ke `data/personnel-certifications-seed.json` berdasarkan tiga level: `Advanced / Expert`, `Intermediate`, dan `Entry Level`. Data personil dan katalog roadmap kini disimpan terpisah:

- `personnel_certifications`: register pegawai (Personnel records) yang dikelola lewat menu aplikasi (create/update/delete).
- `certification_roadmap_catalog`: katalog referensi Security Certification Roadmap 9 (read-only di aplikasi), di-upsert otomatis saat `npm start` dari `data/personnel-certifications-seed.json`.

Seed katalog dapat dibuat ulang setelah sumber roadmap berubah dengan `npm run seed:personnel-certifications`.

Website lokal untuk melakukan penilaian tingkat kematangan keamanan siber berdasarkan **NIST Cybersecurity Framework (CSF) 2.0**. Aplikasi ini membantu pengguna menilai Policy dan Practice pada setiap subcategory, menyimpan catatan tindakan, serta mengelola evidence file berdasarkan Function dan kategori penilaian.

## Login

Semua halaman aplikasi dan API memerlukan login. Akun default:

```text
admin / admin
user  / user
```

Session menggunakan cookie HttpOnly. Username dan password disimpan di tabel PostgreSQL `app_users`; password disimpan sebagai bcrypt hash. Query tabel dan seed account tersedia di `database/users.sql`.

## Fitur

- Dashboard ringkasan tingkat kematangan assessment.
- Perhitungan overall maturity score dengan skala 0 sampai 4.
- Informasi completion progress dan priority gaps.
- Ringkasan maturity berdasarkan Function dan Category.
- Radar chart untuk membandingkan Policy, Practice, dan Target Score.
- Tampilan lengkap NIST CSF 2.0 Core.
- CRUD subcategory CSF 2.0 melalui PostgreSQL.
- Search dan filter berdasarkan Function atau subcategory.
- Penilaian terpisah untuk Policy Maturity dan Practice Maturity.
- Policy Action Notes dan Practice Action Notes pada setiap subcategory.
- Upload evidence file ke struktur folder:

  ```text
  upload/
  ├── Govern/
  │   ├── Policy/
  │   └── Practice/
  ├── Identify/
  ├── Protect/
  ├── Detect/
  ├── Respond/
  └── Recover/
  ```

- Daftar seluruh file yang sudah diupload.
- Informasi Function, Category, Subcategory, tipe evidence, dan tanggal upload.
- Search file evidence.
- Pagination file evidence, maksimal 10 item per halaman.
- Menggunakan kembali file yang sudah diupload sebagai evidence pada subcategory lain.
- Nama file dibuat unik; upload dengan nama yang sudah ada menggunakan path file existing.
- Select uploaded evidence hanya membuat reference, bukan salinan file baru.
- Aksi Open, Download, Replace, dan Delete untuk evidence.
- Penyimpanan otomatis progress melalui API Node.js ke PostgreSQL.
- Evidence otomatis dikirim ke server Node.js dan disimpan di folder `upload/`; PostgreSQL menyimpan path, nama, ukuran, tipe, dan waktu upload.
- Banyak file dalam satu row dikirim melalui satu request `POST /api/files/batch`, sehingga lebih cepat daripada satu request per file.
- Export seluruh progress, catatan, metadata evidence, dan path file ke JSON.
- Import progress dari JSON.
- Reset assessment dengan konfirmasi warning.
- Form Cybersecurity Risk Acceptance untuk mendokumentasikan risiko, justifikasi, mitigasi, serta keputusan Business Owner, CIO, dan CIS.
- Risk Acceptance tersimpan di PostgreSQL dan dapat dibuka kembali, diedit, atau dihapus.
- Reset menghapus progress, catatan, metadata evidence, dan seluruh isi folder upload yang dipilih.

## Database Framework Model

Framework dan control menggunakan model generik yang dinormalisasi:

```text
frameworks (id, name, version, description)
  1 --- n
controls (id, framework_id, code, function, category, subcategory, ...)
```

`controls.framework_id` adalah foreign key ke `frameworks.id`, sedangkan pasangan `(framework_id, code)` wajib unik. Data lama dari `csf_controls` dan `privacy_controls` dimigrasikan idempotently ke tabel generik saat startup.

Framework baru dapat dibuat melalui `POST /api/frameworks`, kemudian control-nya melalui `POST /api/frameworks/:frameworkId/controls`. Endpoint `/api/csf` dan `/api/privacy` tetap tersedia sebagai compatibility layer.

### API CSF 2.0

```text
GET    /api/csf          # List semua control
POST   /api/csf          # Create control
PUT    /api/csf/:id      # Update control
DELETE /api/csf/:id      # Delete control
```

Data awal CSF di-seed dari `data/csf-data.json` hanya ketika tabel `csf_controls` masih kosong.

### API Risk Acceptance

```text
GET    /api/risk-acceptance
POST   /api/risk-acceptance
PUT    /api/risk-acceptance/:id
DELETE /api/risk-acceptance/:id
GET    /api/risk-acceptance/:id/export/pdf
```

## Alur Penggunaan

1. Buka halaman **Overview** untuk melihat ringkasan assessment.
2. Buka **CSF 2.0** atau klik **Open assessment**.
3. Evidence otomatis disimpan ke folder `upload/` oleh server Node.js.
4. Isi nilai Policy dan Practice pada subcategory.
5. Tambahkan Policy Action Notes dan Practice Action Notes.
6. Tambahkan evidence dengan upload file baru atau pilih **Select uploaded evidence**.
7. Gunakan search dan pagination untuk menemukan file evidence yang sudah tersedia.
8. Gunakan **Export JSON** untuk menyimpan progress.
9. Pada perangkat lain, import JSON dan salin folder `upload/` bila file evidence diperlukan.

## Export dan Import

File JSON menyimpan:

- Policy score dan Practice score.
- Action Notes.
- Metadata evidence.
- Path file evidence.
- Lokasi folder upload.
- Informasi halaman dan Function terakhir.

File fisik tidak disimpan di dalam JSON. Ketika berpindah laptop, folder `upload/` harus ikut dipindahkan secara manual.

## Struktur File

```text
src/
├── config/          # Konfigurasi environment dan lokasi direktori
├── controllers/     # Adapter HTTP untuk setiap resource
├── middleware/      # Error handling dan middleware Express
├── routes/          # Definisi endpoint API
├── services/        # Business logic dan filesystem persistence
├── app.js           # Konfigurasi Express tanpa listen()
└── server.js        # Bootstrap server dan startup lifecycle
database/
├── create-database.sql # Query pembuatan database PostgreSQL
└── schema.sql          # Query pembuatan tabel dan index PostgreSQL
scripts/
└── provision-db.js     # Provisioning database dan eksekusi schema
public/              # Frontend statis (HTML, CSS, browser JavaScript)
data/                # Data referensi CSF
upload/              # Evidence otomatis berdasarkan Function dan jenis
package.json         # Dependency dan scripts
```

- `public/index.html` - Struktur halaman aplikasi.
- `public/styles.css` - Styling dan responsive layout.
- `public/app.js` - Logika assessment dan antarmuka browser.
- `data/csf-data.json` - Data NIST CSF 2.0 Core.
- Metadata evidence tersimpan di tabel PostgreSQL `evidence_files`, sedangkan binary file tersimpan satu kali di folder `upload/` untuk upload yang lebih cepat.
- `database/create-database.sql` dijalankan satu kali dari database maintenance seperti `postgres` jika database aplikasi belum tersedia.
- Query schema PostgreSQL terdokumentasi di `database/schema.sql` dan dijalankan otomatis saat startup.

## Teknologi

- HTML5
- CSS3
- JavaScript vanilla
- Node.js HTTP server
- REST API
- Tailwind CSS melalui build pipeline lokal
- PostgreSQL sebagai sumber utama data assessment
- HTML Canvas untuk radar chart

## Contoh Tampilan Website

### Dashboard Overview

![Dashboard Overview](img/nist%201.png)

### Assessment CSF 2.0

![Assessment CSF 2.0](img/nist%202.png)

### Tampilan NIST CSF

![Tampilan NIST CSF](img/NIST%203.png)

### Evidence Management

![Evidence Management](img/NIST%204.png)

### Ringkasan Assessment

![Ringkasan Assessment](img/NIST%20CSF%205.png)

## Catatan Browser
