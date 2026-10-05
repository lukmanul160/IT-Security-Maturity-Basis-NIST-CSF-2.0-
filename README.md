# NIST Basis

Aplikasi web untuk assessment keamanan, risk register, threat modelling,
policy, personel, evidence, serta pengelolaan risiko pihak ketiga. Backend
Express/Node.js memakai PostgreSQL; frontend Vue 3 dibangun melalui Vite dan
Tailwind, lalu disajikan oleh backend pada port default 8000.

## Dokumentasi

- [Pull terbaru, rebuild Docker, dan pemulihan login](docs/UPDATE_DOCKER.md):
  langkah update server dengan data lama tetap tersimpan.
- [Akses jaringan 192.168.130.12:5000](docs/NETWORK_ACCESS.md): pengaturan binding,
  firewall Windows/Linux, dan diagnosis akses LAN untuk Docker/manual.
- [Instalasi langkah demi langkah: manual atau Docker](docs/INSTALL_STEP_BY_STEP.md):
  urutan instalasi baru dari prasyarat sampai login dan pemeriksaan hasil.
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

### Akun dan password awal

Akun berikut otomatis dibuat pada instalasi baru, termasuk mode production:

| Username | Password awal | Role |
| --- | --- | --- |
| `admin` | `AdminInitial123!` | admin |
| `user` | `UserInitial123!` | user |

**Segera ganti password kedua akun setelah login
pertama** melalui **Account → Account Management → Save profile**, sebelum
memberikan akses kepada pengguna lain. Seed tidak menimpa password akun lama.
Perintah `admin:create` di bawah opsional untuk administrator tambahan.

Aplikasi menyediakan dua pilihan deployment. Pilih salah satu sesuai lingkungan:

| Pilihan | Yang dipasang pada komputer/server | Panduan |
| --- | --- | --- |
| Docker Compose | Docker dengan Compose v2; Node.js, npm, PostgreSQL, dan build frontend dijalankan di container | [Deployment Docker](docs/DOCKER.md) |
| Instalasi langsung | Node.js beserta npm, PostgreSQL server, dan PostgreSQL client tools | [Instalasi Linux/Windows](docs/INSTALLATION.md) |

### Opsi Docker

Untuk opsi ini, Anda tidak perlu menginstal Node.js, npm, atau PostgreSQL pada
host. Docker membangun frontend dan menjalankan backend serta database.
Perintah `npm run admin:create` di bawah dijalankan di container melalui
`docker compose exec`, sehingga tidak membutuhkan npm pada host.

Nama aplikasi/container: **IT_Governance_BLACKOWL**. Database: **BlackOwl_DB_Gov**.
Salin `docker.env.example` ke `.env.docker`, isi `BLACKOWL_DB_PASSWORD`, lalu:

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker exec app npm run admin:create
```

Jalankan pembuatan admin setelah startup aplikasi selesai. Buka
http://localhost:5000/login. PostgreSQL hanya diakses melalui `db:5432` di
jaringan internal Docker, tanpa membuka port 5432 pada host. Database dan file
memakai volume permanen.
Lihat [panduan Docker](docs/DOCKER.md) untuk konfigurasi, HTTPS, backup, dan upgrade.

### Instalasi tanpa Docker

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

# Knowledge Notes

Editor visual memakai Tiptap OSS 3 (MIT), berjalan lokal tanpa layanan cloud atau
API key. Toolbar **Numbering** membuat daftar bernomor otomatis: Enter menambah
item, Tab membuat subdaftar, Shift+Tab mengurangi tingkat. Bold, italic, coret,
heading, bullet, checklist, kutipan, kode, undo/redo dan tautan juga tersedia.
Tab **Markdown** mempertahankan akses langsung ke sumber untuk sintaks khusus.
Paste HTML dibersihkan dengan DOMPurify; tautan editor dibatasi ke HTTP/HTTPS.
Penyimpanan dan ekspor tetap menggunakan Markdown, termasuk `[[tautan catatan]]`.
Ketik `[[` atau `[[]]` di editor visual untuk mencari catatan yang sudah ada
berdasarkan judul/nama file dan jalur folder. Pilih dengan klik atau panah atas/
bawah lalu Enter/Tab; Esc menutup saran. Tombol **Tautan catatan** juga membuka
pencarian ini. Tautan yang dipilih menyertakan folder agar tujuan tetap jelas.

Pencarian Knowledge Notes mencakup nama file Markdown/jalur lengkap, judul, isi,
folder, tag, dan wiki-link. Pilih cakupan pada dropdown untuk mempersempit hasil.
Hasil menampilkan jalur file, cuplikan isi, dan sorotan kata yang cocok; klik hasil
untuk membuka catatan. Pencarian berlaku pada catatan yang telah diimpor/disimpan
di modul ini. Pencarian graf memakai aturan yang sama.

Beberapa kata memakai AND; tanda kutip mencari frasa dan minus mengecualikan kata.
Contoh: `isi:"akses data" -tag:arsip`, `file:Policy.md folder:Keamanan`, atau
`judul:"Audit Internal"`. Operator tersedia: `file:`, `judul:` / `title:`,
`isi:` / `content:`, `folder:`, `tag:`, dan `tautan:` / `link:`.

Menu **Knowledge Notes** menyediakan catatan Markdown tersimpan di PostgreSQL,
pencarian isi/tag, tautan `[[Judul]]` atau `[[Judul|Label]]`, backlinks, dan graf
hubungan yang dapat diklik. Menu berada paling bawah sidebar. Explorer menampilkan
pohon folder/subfolder yang bisa dibuka dan ditutup, dengan status ekspansi tersimpan.
Klik folder lalu buat subfolder atau catatan di dalamnya. Drag catatan/folder ke
folder tujuan; drag ke Knowledge Vault untuk memindahkannya ke tingkat utama.
Menu klik kanan atau tombol `⋯` menyediakan rename, subfolder baru, dan hapus folder
kosong. Rename/pindah folder memperbarui seluruh subfolder dan catatan dalam satu
transaksi. Hak baca/tulis mengikuti pengaturan izin modul.

Graf memakai Canvas 2D dengan tata letak gaya pegas. Drag simpul untuk mengatur
posisi, drag latar untuk pan, scroll atau tombol +/- untuk zoom, dan klik simpul
untuk membuka catatan. Tersedia graf lokal, pencarian, filter catatan tanpa hubungan,
warna berdasarkan folder, Fit, jeda simulasi, dan ekspor PNG. Tombol panah membantu
navigasi keyboard; daftar catatan juga tersedia di bawah canvas.

Toolbar editor menyediakan bold, italic, coret, heading, daftar, checklist,
kutipan, kode, dan tautan. Pilih teks lalu klik format, atau gunakan Ctrl+B / Ctrl+I
(Cmd pada macOS). Format disimpan sebagai Markdown dan ditampilkan pada Pratinjau.

Impor beberapa file `.md` / `.txt`, atau backup `.json` hasil ekspor fitur ini.
Judul berasal dari nama file dan harus unik; impor duplikat dibatalkan seluruhnya.
Untuk vault Obsidian, gunakan **Impor folder** agar struktur subfolder dipertahankan.
Lampiran biner dilewati. JSON dan ZIP mempertahankan folder termasuk folder kosong.
Pratinjau menampilkan format dasar dan wiki-link secara aman tanpa menjalankan HTML.

Ekspor catatan aktif ke `.md`, seluruh catatan ke JSON, atau ZIP berisi Markdown
dan backup JSON. Ekstrak ZIP sebelum mengimpor; gunakan JSON untuk memulihkan
seluruh catatan. Simpan perubahan terlebih dahulu sebelum ekspor seluruh vault.
Jika judul berubah, perbarui tautan dari catatan lain yang memakai judul lama.

Migrasi tabel `knowledge_notes` dan `knowledge_note_folders` dijalankan saat startup
dan saat akses pertama modul. Restart server setelah pembaruan kode backend.
Jalankan `npm run test:notes` untuk pemeriksaan logika, dan `npm run test:notes-browser`
untuk pengujian browser/API dengan schema PostgreSQL sementara (memerlukan Chrome
dan database aplikasi yang aktif). Data catatan pengguna tidak dipakai sebagai fixture.

