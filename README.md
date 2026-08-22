# NIST CSF 2.0 Maturity Assessment

Website lokal untuk melakukan penilaian tingkat kematangan keamanan siber berdasarkan **NIST Cybersecurity Framework (CSF) 2.0**. Aplikasi ini membantu pengguna menilai Policy dan Practice pada setiap subcategory, menyimpan catatan tindakan, serta mengelola evidence file berdasarkan Function dan kategori penilaian.

## Fitur

- Dashboard ringkasan tingkat kematangan assessment.
- Perhitungan overall maturity score dengan skala 0 sampai 4.
- Informasi completion progress dan priority gaps.
- Ringkasan maturity berdasarkan Function dan Category.
- Radar chart untuk membandingkan Policy, Practice, dan Target Score.
- Tampilan lengkap NIST CSF 2.0 Core.
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
- Aksi Open, Download, Replace, dan Delete untuk evidence.
- Penyimpanan otomatis progress di browser menggunakan `localStorage`.
- Penyimpanan akses folder upload menggunakan IndexedDB agar dapat dipulihkan setelah refresh.
- Export seluruh progress, catatan, metadata evidence, dan path file ke JSON.
- Import progress dari JSON.
- Reset assessment dengan konfirmasi warning.
- Reset menghapus progress, catatan, metadata evidence, dan seluruh isi folder upload yang dipilih.

## Cara Menjalankan

Aplikasi dapat dijalankan sebagai website statis menggunakan web server lokal. Contoh menggunakan Python:

```bash
python -m http.server 8000
```

Kemudian buka:

```text
http://localhost:8000
```

Aplikasi juga dapat dibuka melalui web server lokal lain yang mendukung file HTML, JavaScript, dan JSON.

## Alur Penggunaan

1. Buka halaman **Overview** untuk melihat ringkasan assessment.
2. Buka **CSF 2.0** atau klik **Open assessment**.
3. Pilih folder upload melalui **Choose upload folder**.
4. Isi nilai Policy dan Practice pada subcategory.
5. Tambahkan Policy Action Notes dan Practice Action Notes.
6. Tambahkan evidence dengan upload file baru atau pilih **Select uploaded evidence**.
7. Gunakan search dan pagination untuk menemukan file evidence yang sudah tersedia.
8. Gunakan **Export JSON** untuk menyimpan progress.
9. Pada perangkat lain, import JSON dan pilih kembali folder upload untuk mengaktifkan akses file.

## Export dan Import

File JSON menyimpan:

- Policy score dan Practice score.
- Action Notes.
- Metadata evidence.
- Path file evidence.
- Nama folder upload.
- Informasi halaman dan Function terakhir.

File fisik tidak disimpan di dalam JSON. Ketika berpindah laptop, folder upload harus ikut dipindahkan secara manual dan dipilih kembali melalui **Choose upload folder** karena akses file dibatasi oleh keamanan browser.

## Struktur File

- `index.html` - Struktur halaman dan tampilan aplikasi.
- `styles.css` - Styling dan responsive layout.
- `app.js` - Logika assessment, upload, export/import, dan penyimpanan progress.
- `csf-data.js` - Data NIST CSF 2.0 Core.
- `csf-data.json` - Data JSON NIST CSF 2.0.
- `upload/` - Folder penyimpanan evidence berdasarkan Function dan jenis Policy/Practice.

## Teknologi

- HTML5
- CSS3
- JavaScript vanilla
- LocalStorage
- IndexedDB
- File System Access API
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
