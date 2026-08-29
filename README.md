PowerShell -ExecutionPolicy Bypass -Command "npm start"
# NIST CSF 2.0 Maturity Assessment

## Clone dan Data Risiko

Data referensi framework/control yang diperlukan untuk menjalankan assessment disimpan di repository:

- `data/csf-data.json` untuk NIST CSF 2.0 Core.
- `data/privacy-data.json` untuk Privacy Framework Core clone-safe.
- `data/risk-indicators.json` untuk seed indikator tanpa membawa Risk Register.
- Seed schema dan akun aplikasi di `database/`.

`Cybersecurity Risk Register.xlsx` adalah data operasional dan tidak boleh di-commit atau di-upload ke GitHub. File tersebut diabaikan oleh `.gitignore`. Jika workbook risk diperlukan, letakkan secara lokal di root project setelah clone. Tanpa workbook tersebut aplikasi tetap dapat dijalankan; Risk Register akan mulai kosong dan dapat diisi melalui UI.

Setelah clone, jalankan:

```text
npm install
npm run db:setup
npm start
```

`db:setup` membuat tabel dan `npm start` menginisialisasi framework/control CSF dan Privacy serta indikator risk dari file repository. `Risk Register`, `Risk Acceptance`, dan opsi dropdown risk tidak pernah di-seed dari workbook atau repository; tabel tersebut dibuat kosong pada clone baru dan hanya dapat diisi melalui aplikasi di database lokal.

Data `Security-Certification-Roadmap9.html` dipetakan ke `data/personnel-certifications-seed.json` berdasarkan tiga level: `Advanced / Expert`, `Intermediate`, dan `Entry Level`. Saat `npm start` dijalankan, seluruh record seed sertifikasi di-upsert ke tabel `personnel_certifications`. Seed dapat dibuat ulang setelah sumber roadmap berubah dengan `npm run seed:personnel-certifications`.

postgresql-18.6-1-windows
node-v24.19.0-x64

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

## Cara Menjalankan

Aplikasi dijalankan menggunakan Node.js 18 atau lebih baru:

```bash
npm install
npm run db:setup
npm start
```

### PostgreSQL

Salin `.env.example` menjadi `.env`, lalu isi kredensial PostgreSQL. Jalankan `npm run db:setup` untuk membuat database jika belum ada dan menerapkan `database/schema.sql`. Koneksi dapat menggunakan `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, dan `DB_PASSWORD`, atau satu `DATABASE_URL`. Status koneksi dapat diperiksa melalui:

```text
http://localhost:8000/api/health/db
```

Contoh respons berhasil:

```json
{ "status": "ok", "database": "postgresql", "connected": true, "connectedAt": "..." }
```

Kemudian buka:

```text
http://localhost:8000
```

Server menyediakan halaman web dan API assessment pada alamat yang sama.

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
