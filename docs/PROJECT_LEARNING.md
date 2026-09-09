# Catatan Learning — NIST Basis

Terakhir ditinjau: 8 September 2026.

Catatan ini menjadi titik awal untuk memahami proyek dan menelusuri perubahan berikutnya. Dasarnya adalah pembacaan source code, route, schema, dokumentasi, dan sebagian test. Aplikasi, koneksi database, dan test belum dijalankan dalam peninjauan ini. Temuan yang membutuhkan pembuktian runtime ditandai terpisah.

Pembaruan: verifikasi UI dan route untuk modernisasi Tailwind sudah dilakukan setelah peninjauan awal; cakupan dan batasnya dicatat pada bagian 10.

## 1. Tujuan dan cakupan

Aplikasi web untuk assessment kematangan dan pengelolaan tata kelola keamanan informasi. Cakupannya sudah lebih luas daripada nama paket `nist-csf-maturity-tool` dan sebagian isi README.

| Modul | Fungsi utama | Titik masuk backend |
|---|---|---|
| NIST CSF 2.0 | Core controls, skor Policy/Practice, target, catatan, evidence | `csfRoutes.js`, `assessmentRoutes.js` |
| Privacy Framework | Core controls dan assessment terpisah | `privacyRoutes.js` |
| ISO 27001 dan SOA | Controls, evidence, applicability, target kategori, information security objectives | `frameworkRoutes.js` |
| Risk Management | Risk Register, indikator dan pilihan dropdown | `riskManagementRoutes.js` |
| Risk Acceptance | Form penerimaan risiko dan export PDF | `riskAcceptanceRoutes.js` |
| Third-Party Risk Management | Register pihak ketiga, tiering, risiko terkait dan due diligence | `tprmRoutes.js`, `tprmQuestionnaireRoutes.js` |
| Questionnaire Templates | Pengelolaan template kuesioner | `questionnaireTemplateRoutes.js` |
| Policy Register | Kebijakan, item isi, attachment dan dropdown | `policyRegisterRoutes.js` |
| Personel dan sertifikasi | Register personel, sertifikasi, layout dan katalog roadmap | `personnelCertificationRoutes.js`, `certificationRoadmapCatalogRoutes.js` |
| Administrasi | Akun, permission, audit, backup dan restore | `authRoutes.js`, `auditRoutes.js`, `backupRoutes.js` |

Semua nama route di tabel berada di `src/routes/`. Daftar mount API tersedia di [src/routes/index.js](../src/routes/index.js); autentikasi dipasang tersendiri di `src/app.js`.

## 2. Arsitektur dan peta file

```text
Browser: public/index.html + public/app.js + CSS
  -> fetch /api/...
  -> Express + autentikasi + audit + permission
  -> routes -> controllers -> services
  -> PostgreSQL (data dan metadata)
  -> upload/ (file evidence), backup/ (backup database)
```

| Lokasi | Peran dan petunjuk analisis |
|---|---|
| [package.json](../package.json) | Dependency dan perintah resmi proyek; CommonJS, Node.js >=18 |
| [src/server.js](../src/server.js) | Bootstrap, provisioning, inisialisasi store dan `listen()` |
| [src/app.js](../src/app.js) | Express 5, JSON body parser, header keamanan, pemeriksaan origin, login, API dan static frontend |
| `src/config/` | Environment, pool PostgreSQL, path direktori dan session |
| `src/routes/` | URL, HTTP method, middleware akses dan upload |
| `src/controllers/` | Adapter request/response; beberapa controller juga mengatur upload/export |
| `src/services/` | Logika domain, SQL langsung lewat `pg`, filesystem dan inisialisasi tabel |
| [public/index.html](../public/index.html) | Struktur halaman, form dan dialog |
| [public/app.js](../public/app.js) | Banyak logika UI dan modul dalam satu file: state, render, kalkulasi, event dan API |
| `public/styles.css`, `public/modern.css` | CSS antarmuka; periksa urutan stylesheet di HTML saat menelusuri tampilan |
| `src/tailwind.css` | Input build Tailwind; hasil build berada di `public/tailwind.css` |
| [database/schema.sql](../database/schema.sql) | Schema utama; baca juga SQL dalam service untuk melihat perubahan saat startup |
| `database/users.sql` | Struktur/seed akun awal |
| `data/` | Referensi framework, indikator dan seed sertifikasi; jangan menganggap semua file sebagai data operasional |
| `scripts/` | Provisioning, generator seed dan script pemeliharaan/debug |
| `test/` | Test service dan script pengujian; belum ada script `npm test` di package.json |

Frontend menggunakan JavaScript vanilla, bukan React/Vue. Dependency utama lainnya: `bcryptjs`, `multer`, `pdf-lib`, `xlsx`, `dotenv`, serta Tailwind CLI untuk build CSS.

## 3. Alur startup

`npm start` menjalankan `src/server.js` dengan urutan:

1. `provisionDatabase()` menyiapkan database.
2. Menyiapkan folder upload dan assessment store.
3. `initializeFrameworks()` menyiapkan framework/control.
4. Menyiapkan store risiko, personel, katalog sertifikasi dan permission.
5. Menyiapkan TPRM, kuesioner, template, policy register, audit dan folder backup.
6. Menjalankan `database/users.sql`, kemudian membuka port aplikasi.

Implikasi: startup dapat menulis schema dan seed. Menjalankan server bukan pemeriksaan read-only. Bila startup gagal, telusuri urutan `await` di `server.js` dan fungsi inisialisasi yang disebut pada error.

## 4. Model data dan alur penyimpanan

### Framework dan assessment

- `frameworks` menyimpan identitas framework; `controls.framework_id` menghubungkannya dengan control. Pasangan `(framework_id, code)` unik.
- `frameworkService.js` menangani model generik. Endpoint CSF dan Privacy tetap tersedia sebagai lapisan kompatibilitas.
- `assessment_state` menyimpan state dalam kolom JSONB `data`. CSF memakai ID `default`; route assessment Privacy memasang ID `privacy`.
- State browser mencakup `scores`, `policyScores`, `practiceScores`, `notes`, `attachments`, dan `targetScores`. `normalizeState` menangani bentuk data lama.
- UI menyimpan CSF lewat `PUT /api/assessment`; Privacy melalui `/api/privacy/assessment`.
- `assessmentService.saveAssessment()` melakukan upsert seluruh state yang dikirim. Pada alur ini ID tidak berasal dari username; jangan mengasumsikan assessment terpisah per pengguna.
- `framework_category_targets` menyimpan target kategori. ISO juga menggunakan data control seperti evidence/applicability dan tabel `information_security_objectives`.
- `localStorage` digunakan untuk preferensi UI seperti halaman/function terakhir dan sidebar; database menjadi penyimpanan utama assessment.

### Evidence

- Binary file terutama berada di `upload/`; tabel `evidence_files` menyimpan metadata. `fileService.readFile()` juga memiliki fallback membaca content dari database.
- Alur umum melewati `fileRoutes.js` -> `fileController.js` -> `fileService.js`; batch upload menggunakan `POST /api/files/batch`.
- Attachment assessment memuat referensi path. Ada pemeriksaan referensi dalam `deleteFile()` dan `resetFilesForAssessment()` sebelum penghapusan tertentu.
- Evidence juga muncul pada controls dan policy register. Saat mengubah penghapusan atau reset, telusuri semua pemakai path; pemeriksaan referensi assessment saja belum membuktikan seluruh modul terlindungi.
- Export JSON assessment memuat state dan referensi, bukan binary file. Pemindahan evidence memerlukan folder `upload/` juga.

### Data operasional dan backup

- Tabel domain mencakup `risk_register`, `risk_acceptance_forms`, `policy_register`, `policy_register_items`, `tprm_risk_register`, `tprm_related_risks`, `tprm_due_diligence_questionnaires`, dan `questionnaire_templates`.
- Data personel berada di `personnel_certifications` dan `organization_personnel`; katalog referensi berada di `certification_roadmap_catalog`.
- `backupService.js` menggunakan `pg_dump`; fallback ke snapshot JSON tabel schema `public` terjadi bila executable tidak ditemukan (`ENOENT`).
- Restore dump menggunakan `pg_restore --clean --if-exists`; restore JSON menjalankan truncate dan insert dalam transaksi. Ini operasi penggantian data.
- Backup database tidak mengarsipkan folder `upload/`. Bedakan backup database dari export state assessment dan salinan evidence.
- README menyatakan Risk Register, Risk Acceptance dan dropdown risk kosong pada clone baru. Workbook Risk Register merupakan data operasional lokal yang dikecualikan oleh `.gitignore`.

## 5. Autentikasi dan hak akses

- Password diverifikasi memakai bcrypt terhadap `app_users`.
- Session menggunakan cookie `nist_session` dan `Map` dalam memori server, dengan umur 8 jam. Restart server mengakhiri session yang ada.
- `requireAuth` memberi respons 401 untuk API tanpa login dan redirect `/login` untuk halaman.
- Role: `admin`, `approver`, `editor`, `viewer`, `user`.
- `permissionService.has()` menggabungkan izin halaman dari tabel `role_permissions` dan izin aksi dari `pageActionMatrix`; admin melewati pemeriksaan tersebut.
- Beberapa endpoint memakai `requireAdmin` atau pemeriksaan evidence khusus. Saat menganalisis akses, baca middleware pada route yang tepat serta aturan frontend.
- `auditRequest` dipasang pada auth routes dan API. Perilaku pencatatan detail ada di `middleware/audit.js` dan `services/auditService.js`.

## 6. Cara menelusuri perubahan atau bug

| Gejala / kebutuhan | Urutan pemeriksaan |
|---|---|
| Tampilan atau modal salah | ID elemen di `index.html` -> render/event di `app.js` -> stylesheet yang aktif |
| Skor/target tidak sesuai | Kalkulasi dan normalisasi state di `app.js` -> payload API -> assessment/framework service |
| Data tidak tersimpan | `fetch` dan respons di browser -> route -> controller -> SQL service -> schema |
| Akses 401/403 | Session -> middleware route -> permission key -> role_permissions + pageActionMatrix |
| Upload/open/delete gagal | Multipart field -> middleware upload/akses -> validasi dan path di file service -> file fisik/metadata/referensi |
| Startup gagal | `server.js` -> konfigurasi/provisioning -> fungsi initialize/ensureStore yang gagal |
| Policy Register bermasalah | `savePolicyRegister` / `savePolicyRegisterItems` di frontend -> route utama/items/dropdowns -> service |
| Tiering/risiko vendor tidak sesuai | `calculateVendorTierScore`, `determineQuestionnaireRiskTier`, `ciaRiskTier` di frontend -> service TPRM/kuesioner |

Gunakan pencarian simbol atau URL agar tidak bergantung pada nomor baris yang mudah berubah. Contoh dari root proyek:

```powershell
rg -n --max-columns 220 --max-columns-preview 'savePolicyRegister|calculateVendorTierScore|normalizeState' public/app.js
rg -n 'assessmentId|requirePermission|requirePageAccess' src/routes
rg -n 'CREATE TABLE|ALTER TABLE' database src/services
```

## 7. Perintah dan batas verifikasi

| Perintah | Tujuan / dampak |
|---|---|
| `npm install` | Instal dependency sesuai manifest/lockfile |
| `npm run db:setup` | Provisioning database dan schema; menulis database |
| `npm start` | Inisialisasi store dan menjalankan server |
| `npm run dev` | Menjalankan server dengan Node watch |
| `npm run build:css` | Membangun ulang `public/tailwind.css` |
| `npm run seed:iso27001` | Membuat ulang seed ISO dari generator |
| `npm run seed:personnel-certifications` | Membuat ulang seed katalog sertifikasi |
| `node --test test/policyRegisterService.test.js test/questionnaireTemplateService.test.js` | Menjalankan dua test service yang memakai mock; hasil belum diverifikasi dalam peninjauan ini |

Di PowerShell, `npm.cmd` bisa dipakai bila wrapper `npm.ps1` dibatasi execution policy. `/api/health/db` memerlukan login. Jangan menjalankan semua script pemeliharaan hanya untuk memahami proyek; baca efeknya dahulu, terutama script reset/fix dan test yang mengakses database langsung.

## 8. Temuan dan pertanyaan terbuka

Berikut adalah hasil pembacaan kode, bukan hasil audit menyeluruh atau pembuktian bug runtime:

| Temuan | Implikasi untuk analisis berikutnya |
|---|---|
| README menyebut skor 0–4; `maturityLabels` frontend memiliki level 1–5 dan normalisasi target menggunakan 1–5 | Cocokkan formula, kontrol input, target dan export sebelum menyelaraskan dokumentasi |
| README menyebut katalog roadmap read-only; route katalog menyediakan POST/PUT/DELETE dengan permission | Pastikan apakah UI mengekspos mutasi dan tetapkan perilaku yang diinginkan |
| Banyak modul berada di satu `public/app.js`, dengan sejumlah fungsi sangat panjang | Periksa event listener, state global dan pemakai bersama saat mengubah satu fitur |
| Schema utama dan SQL initialize/ensureStore sama-sama mengubah database | Jangan menilai schema efektif hanya dari `database/schema.sql` |
| Assessment disimpan sebagai seluruh dokumen JSONB tanpa pemeriksaan versi pada `saveAssessment()` | Uji potensi perubahan saling menimpa bila beberapa pengguna mengedit bersamaan |
| Penghapusan evidence memeriksa referensi assessment, sementara modul lain juga menyimpan evidence | Verifikasi penggunaan bersama lintas modul sebelum mengubah reset/delete |
| Backup database tidak mencakup evidence fisik | Uji pemulihan database dan file sebagai dua bagian yang berkaitan |
| Test yang ditemukan berfokus pada policy register dan template; package.json belum memiliki script test | Belum ada bukti coverage menyeluruh untuk assessment, permission, upload dan backup |

## 9. Memperbarui catatan ini

Setelah perubahan bermakna, perbarui bagian yang terdampak: modul/endpoint, penyimpanan, startup, hak akses, dan temuan terbuka. Catat pengujian yang benar-benar dijalankan beserta hasilnya; jangan mengubah dugaan menjadi fakta tanpa verifikasi. Utamakan nama file dan simbol daripada nomor baris. Simpan catatan tanpa kredensial `.env`, isi backup, evidence, atau data risiko operasional.

## 10. Modernisasi UI dengan Tailwind (8 September 2026)

Tema aplikasi kini menggunakan sidebar slate gelap, permukaan terang, aksen biru, ikon SVG, serta komponen dengan spacing, border, dan tipografi yang konsisten. Halaman pemilihan framework dan login diperbarui; komponen bersama mencakup tombol, kartu statistik, tabel, toolbar, form, pagination, dan dialog.

### Sumber dan urutan CSS

- Edit tema baru di [src/tailwind.css](../src/tailwind.css), lalu jalankan `npm run build:css`. Jangan mengedit hasil build `public/tailwind.css` secara manual.
- Tema menggunakan utility Tailwind melalui `@apply`, dengan scope `.workspace-ui` pada body aplikasi dan login. Font utama memakai stack font sistem agar tidak bergantung pada unduhan font.
- `@source` memindai HTML di `public/` dan `public/app.js`; CSS hasil build tidak dijadikan sumber pemindaian utility.
- Stylesheet lama (`styles.css`, `modern.css`, dan style dalam HTML) masih mendukung struktur serta fitur khusus modul. Link `tailwind.css` berada setelah style tersebut di head `index.html`.
- Aturan tema bersama sengaja berada di luar cascade layer, dengan selector berscope, supaya dapat menimpa CSS lama yang juga tidak memakai layer. Saat suatu style tidak berubah, periksa specificity, inline attribute, dan `!important` sebelum menambah override.
- Aturan `[hidden]` dan hak akses tetap perlu diperhatikan. Styling navigasi bukan sumber otorisasi; pemeriksaan akses tetap berada pada backend.

### Perilaku antarmuka

- Sidebar desktop tetap menempel saat halaman digulir. Saat diperkecil, ikon navigasi tetap tersedia dengan accessible label dan tooltip.
- Pada layar kecil, navigasi berpindah ke atas dan kelompok menu aktif dapat digulir horizontal. Toggle sidebar dapat menyembunyikan menu.
- Tabel lebar tetap memakai container scroll horizontal agar semua kolom dapat diakses.
- Dialog membatasi tinggi terhadap viewport, memakai satu area scroll utama dan mengunci scroll halaman di belakangnya.
- Tersedia fokus keyboard yang terlihat, skip link ke konten utama, dan dukungan `prefers-reduced-motion`.
- ID elemen aplikasi dipertahankan agar event handler di `public/app.js` tetap terhubung.
- Login memakai CSS build yang sama. `src/app.js` menyediakan `GET /tailwind.css` sebelum middleware autentikasi agar stylesheet login dapat dimuat tanpa sesi.

### Verifikasi yang sudah dilakukan

- `npm.cmd run build:css`: berhasil.
- `node --check src/app.js` dan `node --check public/app.js`: berhasil.
- `git diff --check`: tidak menemukan kesalahan whitespace; Git memberi pemberitahuan normalisasi LF/CRLF pada Windows.
- Chrome headless dengan API fixture lokal read-only: memeriksa framework chooser, sidebar normal/collapsed, CSF overview/core table, Policy Register dan dialog, serta login. Ukuran viewport meliputi 1440, 1024, 768, dan 390 piksel.
- Pemeriksaan tambahan pada lebar 390 piksel: Risk Management, kuesioner TPRM, ISO 27001, dan Uploaded Files. Tidak ditemukan overflow horizontal pada dokumen di halaman yang diperiksa; tabel/navigasi memiliki scroll internal.
- Tidak ada exception JavaScript yang tertangkap pada alur preview tersebut. Dialog mobile sempat memiliki scroll bertumpuk dari CSS lama; sudah diperbaiki dan diperiksa ulang.
- Pemeriksaan HTTP menggunakan Express app tanpa menjalankan bootstrap database: `/login` dan `/tailwind.css` mengembalikan 200, `/` dan `/index.html` mengarahkan pengguna tanpa sesi ke login, `/api/health` mengembalikan 401.
- Dibandingkan dengan Git: ID lama di `public/index.html` tetap tersedia dan stylesheet Tailwind ditautkan satu kali.

Verifikasi ini tidak mencakup login dengan kredensial nyata, penyimpanan assessment ke PostgreSQL, upload evidence, atau operasi reset/restore. Data operasional tidak digunakan dalam preview dan logika assessment di `public/app.js` tidak diubah oleh modernisasi ini.

### Perbaikan login ketika stylesheet belum tersedia

Pada pemeriksaan langsung server lokal yang sedang berjalan, `GET /login` mengembalikan 200 tetapi `GET /tailwind.css` mengembalikan 302 ke `/login`. Proses server tersebut belum menyediakan route CSS publik yang ditambahkan pada modernisasi. HTML login yang baru sudah terbaca dari disk, sedangkan kode route masih mengikuti proses server lama; akibatnya login tampil tanpa stylesheet.

`public/login.html` kini menyertakan critical CSS sebelum link Tailwind untuk menjaga layout, ukuran logo, field, tombol, fokus keyboard, dan breakpoint mobile ketika stylesheet eksternal gagal dimuat. SVG logo juga memiliki atribut `width`/`height` eksplisit. Tailwind tetap memberi tema bersama saat stylesheet tersedia. Bila desain login diubah lagi, selaraskan critical CSS ini dengan bagian login di `src/tailwind.css`.

Verifikasi Chrome headless dilakukan pada server berjalan (CSS 302) dan instance Express dari kode terbaru tanpa bootstrap database (CSS 200), masing-masing pada lebar 320, 390, 768, dan 1440 piksel. Layout grid tetap aktif, logo berukuran 23 piksel, input dapat diakses dan tidak ada overflow horizontal dokumen atau exception JavaScript. Pemeriksaan tidak mengirim kredensial atau mengubah data. Perbaikan fallback dapat terlihat dengan memuat ulang login; restart server diperlukan untuk mengaktifkan route CSS publik pada proses lama.

## 11. Alur pegawai sebelum sertifikasi (9 September 2026)

`organization_personnel` adalah sumber identitas pegawai. `personnel_certifications.personnel_id` merupakan foreign key wajib ke `organization_personnel.id`, tanpa batas satu sertifikasi per pegawai. Kolom nama, Employee ID, jabatan, dan atasan pada sertifikasi masih tersedia untuk kompatibilitas, tetapi nilainya diambil dari daftar pegawai oleh backend.

### Alur UI dan API

- Tab **1. Daftar pegawai** dipakai untuk mendaftarkan pegawai. Atasan langsung opsional; nilai kosong menunjukkan tidak ada atasan langsung. Validasi yang melarang nama sendiri sebagai atasan tetap berlaku.
- Daftar pegawai menampilkan jumlah sertifikasi dan tombol **Tambah sertifikasi** yang membuka form dengan pegawai tersebut sudah dipilih. Pegawai tanpa sertifikasi tetap muncul di daftar dan bagan.
- Tab **2. Sertifikasi pegawai** menampilkan register sertifikasi sebelum canvas roadmap. Tombol tambah dinonaktifkan jika belum ada pegawai, disertai petunjuk pendaftaran.
- Tab **3. Reference Roadmap**, di samping tab kedua, menampung bagian **Security Certification Roadmap 9**, tombol pengelolaan katalog, dan dialog detail katalog. Panel `personnelReferenceRoadmapPanel` terpisah dari `personnelCertificationMapPanel`; `setPersonnelCertificationTab()` hanya menampilkan panel yang dipilih dan memperbarui status tombol. Saran katalog pada form sertifikasi tetap tersedia. Struktur HTML, urutan ketiga tab, sintaks JavaScript, dan build Tailwind telah diperiksa setelah pemindahan ini.
- Form sertifikasi memakai select `certificationPersonnelId`; identitas lain bersifat read-only. Katalog roadmap tetap menyediakan saran nama sertifikasi serta pengisian issuer/level/reference.
- POST/PUT `/api/personnel-certifications` kini wajib memuat `personnelId` dan `certificationName`. Nama bebas tidak dapat dipakai untuk membuat pegawai secara implisit. ID tidak terdaftar ditolak dengan 400.
- Backend mengambil identitas dari register di dalam transaksi dan mengunci row pegawai selama penulisan sertifikasi. Nilai identitas palsu dari payload diabaikan.
- Pengelompokan sertifikasi dan pencocokan sertifikasi dalam bagan memakai ID pegawai. Update pegawai memperbarui kolom kompatibilitas pada semua sertifikasinya dalam satu transaksi.
- Hapus pegawai yang masih memiliki sertifikasi ditolak oleh foreign key `ON DELETE RESTRICT` dan diterjemahkan menjadi respons 409 yang ditampilkan di halaman.
- Relasi atasan masih disimpan sebagai `supervisor_name`, bukan self-referencing foreign key. Nama atasan yang ambigu tidak dipakai untuk memilih induk secara sembarang; node tetap ditampilkan untuk koreksi. Perubahan model atasan ke ID merupakan pekerjaan terpisah.
- Listener tambah/close sertifikasi yang ganda sudah dirapikan agar reset form tidak menimpa pilihan pegawai atau menyembunyikan form setelah dialog dibuka kembali.

### Migrasi dan file utama

- [database/personnel-certification-links.sql](../database/personnel-certification-links.sql): dijalankan oleh `ensureStore()` di dalam transaksi setelah kedua tabel tersedia. Lock tabel mencegah dua proses inisialisasi melakukan backfill bersamaan.
- Sertifikasi lama dicocokkan berdasarkan nama dan Employee ID yang sudah di-trim. Jika belum ada pemilik di register, migrasi membuat row pegawai dari data lama. Jika ada beberapa row register dengan pasangan identitas yang sama persis, dipilih ID terkecil; row lainnya tidak dihapus.
- Setelah backfill, migrasi menambahkan foreign key, constraint NOT NULL dan index pada `personnel_id`. Migrasi dapat dijalankan ulang tanpa menggandakan pegawai hasil backfill.
- [src/services/personnelCertificationService.js](../src/services/personnelCertificationService.js): transaksi, validasi pemilik, CRUD, sinkronisasi identitas dan format tanggal DATE dari PostgreSQL untuk input HTML.
- `public/app.js`: `renderCertificationPersonnelOptions`, `startNewCertification`, `syncCertificationPersonnelFields`, `renderOrganizationPersonnelStructure`, `renderCertifications`, serta handler simpan pegawai/sertifikasi.
- `public/index.html`: tahapan UI, pilihan pegawai terdaftar, field identitas read-only dan pesan alur.
- `src/tailwind.css`: ukuran tabel pegawai agar aksi penambahan terlihat pada desktop; build menghasilkan `public/tailwind.css`.

### Hasil verifikasi dan aktivasi

- Sembilan pengujian pada `test/personnelCertificationService.test.js` lulus, termasuk migrasi legacy/idempotensi, pemilik wajib terdaftar, atasan kosong, dua sertifikasi per pegawai, nama sama dengan ID berbeda, perubahan identitas, preservasi posisi canvas, dan penolakan penghapusan pegawai yang masih memiliki sertifikasi.
- Pengujian PostgreSQL menggunakan tabel TEMP khusus satu koneksi, sehingga tidak mengubah data aplikasi. Jalankan dari PowerShell dengan `$env:PERSONNEL_DB_TEST = '1'` lalu `node --test test/personnelCertificationService.test.js`. Tanpa flag, pengujian database dilewati dan validasi dasar tetap berjalan.
- Chrome headless diuji dengan endpoint personnel asli dan tabel PostgreSQL TEMP: daftar pegawai teratas tanpa atasan, tambah CISSP dan CISM untuk satu pegawai, tambah bawahan, cek satu row pegawai memuat dua sertifikasi, dan buka form mobile. Tidak ada exception JavaScript pada alur tersebut.
- Build Tailwind dan pemeriksaan sintaks JavaScript berhasil.
- Server lokal telah dijalankan dengan kode baru pada port 8000. Startup menerapkan migrasi; pemeriksaan read-only sesudahnya memastikan foreign key tersedia dan tidak ada sertifikasi tanpa pemilik terdaftar. `/login` dan `/tailwind.css` sama-sama mengembalikan 200.
- Untuk instalasi berikutnya, jalankan ulang server setelah memperbarui kode. `npm start` atau `npm run db:setup` memanggil migrasi secara otomatis; jangan menjalankan file migrasi sendiri tanpa transaksi.

## 12. Edit file dari Uploaded Files (9 September 2026)

Daftar **Uploaded files** dibentuk dari referensi file pada assessment CSF, Privacy assessment, evidence ISO 27001/SOA, dan attachment Policy Register. Daftar ini bukan sumber relasi tersendiri; setiap row tetap menunjuk ke record asalnya.

### Perilaku edit berdasarkan sumber

- Tombol **Edit** hanya tampil untuk role yang boleh memperbarui sumbernya. Evidence biasa memakai izin update `files`; Policy Register mengikuti izin update `policy-register`.
- Attachment Policy Register membuka `policyRegisterModal`, sehingga file diganti bersama form dan perilaku Policy Register yang sudah ada.
- Evidence CSF, Privacy, ISO 27001, dan SOA membuka `uploadedFileEditModal`. Modal menunjukkan framework, fungsi, kategori, kontrol, nama, dan path asal sebelum pengguna memilih file pengganti.
- Tombol **Buka lokasi asal** membawa pengguna ke assessment/kontrol terkait. ISO dan SOA membuka manager kontrol masing-masing.
- File pengganti harus memiliki ekstensi yang sama. Nama dan path logis lama dipertahankan, sehingga referensi lain yang memakai path tersebut tetap dapat membuka file setelah isinya diganti.
- Setelah upload berhasil, metadata referensi diperbarui kembali ke assessment JSONB atau evidence kontrol ISO sesuai sumber row. Key ISO pada library membawa framework eksplisit (`iso27001` atau `iso27001-soa`) agar ID kontrol yang sama tidak salah diarahkan.

### Backend dan verifikasi

- `PUT /api/files/*path` menerima satu multipart field `file`, dibatasi 50 MB, dan hanya menerima PDF, Word, atau PowerPoint. Endpoint memakai `files:update` serta pemeriksaan direktori evidence yang sama dengan download/delete.
- `fileService.replaceFile()` menormalisasi path, memastikan file sudah ada di disk atau metadata database, menolak perubahan ekstensi, menulis konten baru pada path yang sama, dan melakukan upsert metadata `evidence_files`.
- `test/fileService.test.js` menguji konten, metadata, path yang tetap, serta penolakan format berbeda dengan file dan row database sementara yang dibersihkan setelah test.
- `node test/fileService.test.js`, test service lain, pemeriksaan sintaks JavaScript, dan `npm.cmd run build:css` berhasil. Smoke test HTTP melalui server lokal juga berhasil untuk login, upload, PUT replace, download hasil baru, dan delete file uji.
- Pada Windows ini, `node --test` paralel gagal sebelum menjalankan test karena child process ditolak dengan `spawn EPERM`; test dijalankan langsung satu per satu menggunakan `node test/<file>.js`.
