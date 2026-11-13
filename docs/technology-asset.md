# Technology Asset

Deployment Docker menambahkan cache Redis opsional untuk hasil sukses kandidat
CVE NVD selama 5 menit, selain cache memori lokal. Identitas query mencakup nama,
versi, filter recent dan halaman; `checkedAt` tetap waktu pencarian asal dan
`cached: true` menandai hasil cache. Error dan scan website tidak disimpan ke Redis.
Instalasi langsung memakai perilaku lama; gangguan Redis kembali ke cache lokal/
NVD dengan throttle lama. Lihat [konfigurasi Redis Docker](DOCKER.md#redis-khusus-docker).

Menu **Asset Management > Technology Asset** memetakan aplikasi ke teknologi dan
versi. Register ini terpisah dari hardware Asset Register dan tidak mengubah data
aset lama. Data tersimpan di PostgreSQL (`technology_assets`), bukan localStorage.
Tabel dibuat idempotent saat startup/akses pertama; restart backend setelah update.

## Lima tab

1. **Dashboard**: aplikasi, pasangan teknologi/versi, teknologi versi yang dipakai
   bersama, perbedaan versi, serta tabel perbandingan versi antar-aplikasi.
2. **Technology Radar**: empat kategori Languages & Frameworks, Platforms &
   Infrastructure, Data & Storage, Tools & Practices. Ring Adopt/Trial/Assess/Hold
   ditentukan pengguna. Bila ring sama-teknologi/sama-versi berbeda antar-aplikasi,
   radar memakai keputusan paling berhati-hati: Hold > Assess > Trial > Adopt.
3. **Register Asset**: buat/ubah aplikasi melalui modal: nama, pemilik/tim, URL,
   deskripsi, daftar teknologi, versi, kategori, ring, sumber, evidence dan alasan.
   Tambah manual atau Scan teknologi website. Klik Simpan untuk menyimpan draft.

4. **Pencarian teknologi**: modal filter sampai 20 kriteria, gabungan AND/OR,
   nama teknologi dengan saran dari register dan operator versi =, contains, <, <=,
   >, >=. Pencarian ini menggunakan seluruh register yang dimuat, independen dari
   filter Dashboard/Radar/Graph. Tidak menyimpan filter ke database.
5. **Graph aplikasi dan teknologi**: relationship graph seperti Knowledge Notes,
   memakai komponen canvas KnowledgeGraph dengan hubungan eksplisit aplikasi ke
   teknologi/versi (tidak mengubah atau membuat catatan Knowledge Notes). Drag node,
   pan latar, zoom roda/keyboard, Fit, pause/resume, label, hubungan terpilih,
   ekspor PNG dan daftar node aksesibel tersedia. Graph hanya tampil di tab ini.

Contoh: Aplikasi A menggunakan A/B/C/D, aplikasi B menggunakan B/C/D/E.
Graph memiliki lima simpul teknologi dan tiga simpul dipakai bersama (B/C/D).
Jika B pada aplikasi kedua berubah dari v1 menjadi v2, graph memisah B v1/B v2
serta dashboard menandai perbedaan versi. Tambah/hapus/edit register memperbarui
radar, graph dan perbandingan tanpa mengubah relasi aplikasi lain.

Identitas simpul adalah nama + versi + kategori (nama/versi case-insensitive).
Tidak ada penyamaan atau konversi semver otomatis: 8.2, 8.2.0 dan 8.3 berbeda.
Versi kosong ditampilkan **Belum diketahui**, bukan diasumsikan terbaru/aman.
Satu aplikasi boleh memiliki beberapa versi teknologi yang sama; duplikasi persis
dalam kategori yang sama ditolak. Maksimum 100 teknologi per aplikasi.

## Graph dan filter

Relationship graph aplikasi-teknologi hanya tersedia pada tab Graph, dengan klik simpul,
keyboard Enter, drag/pan dan zoom. Pemilihan teknologi menampilkan semua
aplikasi yang memakainya; pemilihan aplikasi menampilkan stack-nya. Pencarian nama/
pemilik/URL/teknologi/versi mempersempit aplikasi. Filter kategori/ring/versi
mempersempit simpul dan teknologi yang tampil, tidak menghapus data.

Batas graph: 30 aplikasi dan 60 teknologi tiap tampilan, ditampilkan sebagai
petunjuk UI; gunakan pencarian/filter untuk data yang lebih besar. Tabel register
menyediakan seluruh data yang dimuat. Radar menampilkan satu titik per pasangan
teknologi/versi/kategori dan daftar yang dapat diklik; warna membedakan ring.
Ring merupakan keputusan organisasi, bukan skor risiko/vulnerability scan.

## Scan teknologi website otomatis

Masukkan URL lalu klik **Scan teknologi website**. Scanner GET pasif membaca
header, maksimum 512 KiB HTML, generator meta, referensi script/style, marker
framework dan nama cookie. Maksimum 12 aset JS/CSS satu origin dibaca (128 KiB
per aset) untuk mengenali banner versi, tanpa mengeksekusi kode. Signature lokal
mengenali antara lain WordPress, Drupal, Joomla, WooCommerce, React, Vue, Angular,
Next.js, Nuxt, jQuery, Bootstrap, Laravel, Django serta server/CDN dari header.
Fingerprinting memakai aturan lokal dan tidak menjamin inventaris stack lengkap.

Mendukung URL publik dan internal (RFC1918, CGNAT, IPv6 ULA), DNS internal dan
port aplikasi khusus. Backend harus dapat menjangkau jaringan tujuan; scan internal
dijalankan dari jaringan/VPN backend. TLS tetap diverifikasi; gunakan CA perusahaan
yang dipercaya backend untuk sertifikat internal. Loopback, link-local, metadata,
multicast/reserved, kredensial URL dan protokol selain HTTP/HTTPS diblokir.
Maksimum tiga redirect halaman; setiap koneksi menjalani validasi DNS dan address
pinning. Redirect publik ke internal ditolak; scan URL internal secara langsung.
Redirect aset tidak diikuti. DNS dibatasi tiga detik, halaman 5,5 detik, tiap aset
tiga detik, header 16 KiB. Maksimum dua scan aktif per proses dan satu scan per
pengguna per 10 detik.

Tidak mencoba login, exploit, crawling halaman lain atau menjalankan JavaScript.
Tidak mengirim cookie/Authorization. Nilai cookie dan isi halaman/aset tidak
 dikembalikan atau disimpan; hanya petunjuk teknologi yang disanitasi. Scan dilakukan
langsung oleh backend tanpa mengirim halaman internal ke layanan pihak ketiga.
Versi hanya diisi jika terlihat. Teknologi tersembunyi, aplikasi yang membutuhkan
login atau rendering JavaScript dapat memerlukan pelengkapan manual. Proxy/CDN
bukan bukti stack origin; petunjuk dapat salah atau dipalsukan.

Hasil otomatis masuk draft dengan ring Assess dan sumber Header hint/Scan website.
Periksa lalu Simpan untuk menyimpan register. Versi lama/manual dipertahankan dan
duplikasi tidak ditambah. Gagal membaca aset tidak membatalkan hasil halaman;
scan gagal mempertahankan draft. Waktu scan ditampilkan dalam sesi editor.

Ring radar adalah keputusan organisasi, bukan skor kerentanan:
- **Adopt**: disetujui untuk operasional.
- **Trial**: sedang diuji sebelum adopsi luas.
- **Assess**: sedang dievaluasi.
- **Hold**: hindari adopsi baru dan tinjau penggunaan yang ada.

Angka menunjukkan jumlah teknologi/versi di tiap ring; **0** berarti belum ada.
Penjelasan juga tersedia langsung pada tab radar dalam Indonesia/English.

## Pencarian CVE per versi

Tombol **Cari CVE versi ini** tersedia pada perbandingan versi, detail simpul dan
editor teknologi. Nama dan versi wajib diketahui; versi kosong tidak bisa dicari.
Modal memanggil NVD CVE API 2.0 dengan keywordSearch nama+versi. Mode awal membatasi
last-modified ke 119 hari terakhir agar pembaruan kandidat mudah dicari; matikan
opsi dan Periksa ulang untuk seluruh rentang waktu. Hasil menampilkan CVE, CVSS/
severity jika tersedia, deskripsi sumber, tanggal published/last-modified, status,
waktu pemeriksaan serta tautan sumber. Tidak ada pemberitahuan otomatis/scheduler.

**Kandidat kata kunci bukan konfirmasi bahwa aplikasi terdampak.** Nama produk,
vendor, CPE, rentang versi dan konfigurasi harus dicocokkan di sumber. Keyword
versi bisa tidak muncul pada CVE yang memakai rentang versi; hasil kosong tidak
berarti aman. Tidak ada database CPE/semver matching atau verifikasi patch otomatis.
CVE tidak mengubah ring radar atau nilai risiko tanpa keputusan pengguna.

Sumber tetap `https://services.nvd.nist.gov/rest/json/cves/2.0`, tidak menerima
alamat API dari pengguna. Hanya nama/versi dikirim ke NVD, bukan nama aplikasi,
URL internal atau credential. Memerlukan internet dari backend; tanpa API key.
Batas satu request per proses per tujuh detik; cache 5 menit (100 kombinasi),
timeout 10 detik, respons maksimum 4 MB, halaman 20 kandidat sampai offset 10000.
Hasil tiap halaman diurutkan berdasarkan last-modified; urutan seluruh halaman
mengikuti API, bukan jaminan 20 CVE terbaru secara global. Pembatasan/error NVD
ditampilkan dan tautan pencarian sumber tetap tersedia. Tidak ada klaim dukungan
NVD atau bahwa hasil lookup merupakan audit keamanan lengkap.

Rujukan resmi: [NVD CVE API](https://nvd.nist.gov/developers/vulnerabilities),
[NVD API guidance](https://nvd.nist.gov/developers/start-here),
[schema API/CVSS pada spesifikasi NIST](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-126r4.pdf).

## Akses, konflik, bahasa

Permission baru `technology-asset` terpisah dari hardware register. Default:
semua role membaca, admin/approver/editor/user membuat dan mengubah, admin/approver
menghapus. Scan memerlukan create atau update ditambah read. Pencarian CVE memakai
read. Server menegakkan izin, meskipun tombol disembunyikan frontend.

Record memakai version optimistic concurrency. Simpan/hapus dari versi lama
menghasilkan 409, tanpa menimpa record terbaru; draft di modal dipertahankan.
Tutup/Escape meminta konfirmasi perubahan. Bahasa Indonesia/English mengikuti
workspace, data nama/versi/URL/evidence pengguna tidak diterjemahkan.

## Peta kode dan verifikasi

- Backend: technologyAssetService.js, technologyHeaderScanService.js,
  technologyVulnerabilityService.js dan technologyAssetRoutes.js.
- Deteksi murni: src/shared/technologyFingerprint.js.
- UI: TechnologyAssetView.vue; model graph/radar: technologyAssetModel.mjs.
- Startup/sidebar/izin mengikuti integrasi runtime bersama, tanpa mengganti ID lama.
- `npm run test:technology-asset`: validasi, signature, URL/DNS/redirect/rebinding,
  HEAD/GET TCP lokal, gzip dan batas HTML dengan DNS pinning nyata, model sharing/versi/ring, CVE fixture,
  CRUD/konflik/HTTP permission pada PostgreSQL sementara.
- `npm run test:technology-asset-browser`: Chrome memakai komponen sumber dan API
  fixture, menguji tiga tab, A/ABCD+B/BCDE, versi berbeda, graph/radar, bahasa,
  scan draft-only/error retention, query versi CVE, viewer dan viewport 1280/390.

Fixture tidak menghubungi website organisasi atau provider NVD live. Ketepatan
deteksi semua situs, dukungan provider produksi, seluruh viewport, login end-to-end,
Docker/cloud dan suite aplikasi penuh belum diverifikasi pada fitur ini. Build
frontend diperlukan dan restart backend setelah update. Jangan memakai data
operasional atau .env sebagai fixture untuk mengulang tes.

Register dan editor menampilkan remark per teknologi: **Hasil scan** untuk source
`header`/`scan`, **Input manual** untuk `manual`. Bahasa Inggris: Scan result/Manual
input. Sumber tetap tersimpan per teknologi; satu aplikasi dapat memiliki campuran
keduanya. Remark adalah sumber yang dicatat, bukan bukti audit yang immutable.

Kegagalan scan yang dikenal dikembalikan sebagai 502/504 dengan pesan tersanitasi
(DNS, TLS, koneksi ditolak, jaringan tidak terjangkau, timeout). Error pemrograman
tetap melewati middleware generik; raw socket error tidak ditampilkan ke pengguna.

Scanner menggabungkan seluruh kecocokan header, HTML, nama cookie dan aset, tidak
berhenti pada hasil pertama. Hasil scan menampilkan jumlah dan daftar teknologi/versi.
Maksimum 12 aset satu origin dibaca berurutan; referensi CDN tetap diperiksa namanya
tanpa mengunduh dari origin lain. Total waktu dapat bertambah menurut jumlah aset.
Batas 100 teknologi per aplikasi tetap berlaku; stack tersembunyi atau dependency
server/database yang tidak terekspos tidak bisa diinventaris lengkap secara pasif.

Hasil scan ditampilkan dalam grid card ringkas (nama, versi, sumber), dengan scroll
lokal maksimum 280px. Editor teknologi memakai card yang dapat dibuka untuk detail;
card hasil scan awalnya tertutup, input manual terbuka. Script HTML menandai
JavaScript tanpa mengarang versi; JSON-LD bukan signature JavaScript. Contoh stack
PHP + JavaScript + Bootstrap dikembalikan bersama bila semua petunjuk tersedia.

## Mode browser (rendered profiling)

Tombol **Scan browser (lebih lengkap)** pada modal aplikasi mengirim mode `browser`
ke endpoint scan yang sama, dengan permission/throttle yang sama. Membutuhkan
Chrome/Chromium terpasang di backend; executable dideteksi di lokasi Windows/Linux
umum atau `CHROME_PATH`. Tidak menambahkan dependency npm atau menginstal browser
otomatis. Docker memerlukan image dengan Chromium, user non-root dan sandbox yang
berfungsi. Jangan menonaktifkan sandbox/TLS untuk menjalankannya. Image Docker dan
cloud belum diuji langsung.

Mode ini menjalankan JavaScript dalam profile sementara tanpa sesi pengguna, lalu
memeriksa rendered HTML dan allowlist runtime: Angular ng-version, Zone, jQuery,
Vue, React, Bootstrap, litHtmlVersions, litElementVersions, CKEditor, Google Maps,
Google Tag Manager dan Lodash. Versi hanya disimpan bila terungkap. Semua hasil
masuk draft/card Hasil scan; tidak otomatis menyimpan register. Tambahan signature
statis mengenali Google Font API, Maps, Open Graph dan petunjuk Zone/CKEditor.
Manifest ditulis **Web App Manifest**, bukan konfirmasi seluruh syarat PWA;
link WhatsApp bukan bukti penggunaan WhatsApp Business API.

Chrome tidak diberi akses jaringan langsung: memakai proxy mati, DNS resolver
tertutup, dan request interception. Hanya GET document utama (maksimum empat,
termasuk redirect), script dan stylesheet yang diteruskan lewat transport Node
bervalidasi DNS/address pinning/TLS. Resource internal lintas origin dan transisi
publik ke internal ditolak. POST, iframe, gambar, font, fetch/XHR dan request lain
diblokir. Tidak memakai cookie/login, tidak crawling atau mencoba exploit.
Ini dapat menghalangi hydration/data API, lazy loading dan beberapa fitur situs;
hasil ditandai parsial jika resource diblokir atau batas tercapai.

Batas sesi sekitar 25 detik setelah startup, paling banyak 40 request diperiksa,
8 MiB payload yang diterima, 512 KiB HTML per dokumen, 2 MiB per JS/CSS. Tunggu
sekitar 1,5 detik setelah load untuk marker runtime. Profile sementara dibersihkan
setelah proses berhenti. Data mentah/variabel window lain tidak dikembalikan.
Detektor lokal memiliki cakupan terbatas dan tidak menjamin inventaris lengkap.

`npm run test:technology-browser-scan` menguji Chrome nyata dengan respons website
fixture yang diinjeksi: DOM tertunda Angular, globals Zone/lit, deduplikasi versi,
POST/metadata diblokir. Tidak memakai database operasional atau halaman organisasi.

Verifikasi langsung 2026-11-09: mode browser pada https://www.brins.co.id merespons
200 dan menemukan 11 teknologi/petunjuk termasuk Zone.js, CKEditor, Maps, Font API,
GTM, lit-html 3.3.3 dan lit-element 4.2.2. Hasil parsial (16 request diblokir),
Angular 15.2.9 pada screenshot pengguna belum terbaca; tidak mengklaim parity.

## Perbandingan versi untuk pencarian

PHP < 7.1.1 cocok dengan 6.1.1.1, 7.0 dan 7.1.0; tidak cocok dengan 7.1.1 atau 7.2.
Angka tiap bagian dibandingkan memakai BigInt, bukan string/desimal: 7.10 > 7.2.
Bagian yang tidak ditulis dianggap nol untuk perbandingan: 7.1.1.0 = 7.1.1.
Identitas graph/register tetap memakai string versi asli, sehingga kedua versi
tersebut masih dapat menjadi node berbeda. Batas perbandingan 100 karakter dan
20 bagian numerik. Versi kosong/suffix prerelease/non-numerik tidak cocok dengan
operator <, <=, >, >=; operator exact/contains tetap tersedia untuk teks.
AND mengharuskan semua kriteria ditemukan pada aplikasi yang sama, termasuk
teknologi yang berbeda. OR cukup satu kriteria. Teknologi yang ditampilkan di hasil
hanya yang cocok. Hasil menunjukkan data inventaris, bukan penetapan EOL/CVE/aman.


## Review keamanan

Lihat [review kedua modul 2026-11-09](security-review-technology-checklist-2026-11-09.md).
Channel CDP kini dibatasi 2 MiB/handshake3 detik, navigasi document hanya URL awal
atau HTTP redirect yang disetujui. Search pada canvas mencocokkan frasa literal
nama/folder/konten node dan mempertahankan tetangga satu hop; tidak memperluas
semua koneksi tetangga menjadi hasil baru. Search Knowledge Notes lama tetap
menggunakan sintaks/operator catatan aslinya. Nama pengguna tidak diubah jadi wiki-link.


## Project-owned browser detection

Browser scan uses original rules maintained in `src/shared/technologyRules.js`,
with the existing passive detector and runtime observations. No external rule
snapshot, subscription, API key, or updater is required. The initial local set
contains 16 definitions; coverage is intentionally limited and does not promise
complete technology inventory. Add observations and synthetic fixtures together.

Rules describe JS property paths, DOM selectors/attributes, headers, script URLs
and script/HTML markers with native regular expressions and explicit version
captures. Versions are reported only when observed; Next.js can imply React with
an unknown version and an inferred flag. Evidence records observation names,
not raw analytics identifiers. Regex evaluation retains the 192 MiB worker and
six-second deadline. Existing browser isolation, network restrictions, partial
results, and header-only handling of denial pages remain in place. Chromium is
still required for browser mode. Docker/cloud have not been verified directly.

## Live scan progress and partial timeouts

The editor shows a native progress bar and percentage for both scan modes. The
client requests application/x-ndjson from the existing POST /scan endpoint. The
server streams actual stages (URL/DNS, browser startup, navigation, resources,
runtime, DOM and signatures), with monotonic percentages.100 means the result has
completed, including explicitly partial results, not that every technology is known.
Errors retain the last percentage and never claim100. JSON callers remain compatible.
The stream uses private/no-store/no-transform, X-Accel-Buffering:no and flushes when
supported; an external reverse proxy may still need streaming/buffering settings.

Browser navigation commands are bounded separately from resource/DOM/script work.
A slow or non-terminating script can time out. If the main page was already received,
expected navigation/runtime/DOM execution timeouts preserve header/HTML/asset results
and set partial plus timeoutStage. A missing main page or closed/oversized CDP channel
still fails safely. Limits and network isolation are retained rather than disabled.
The UI identifies the timed-out stage when a partial result is available. No timeout
of a specific user website can be diagnosed solely from the old generic error.

## Table density and pagination

Register Asset, version comparison and technology-search tables each show at most
20 rows with Previous/Next, page count and total. Pagination is client-side over the
loaded inventory; it does not limit backend record count or graph/search scope.
Version comparison pages count flattened technology/version rows, not product groups.
Filtering resets relevant pages and stale page numbers clamp to the last valid page.
CVE provider paging remains20 results per page.

Technology lists within register/search table cells show at most5 items. See more
(+remaining) opens a read-only modal of the complete matching technology/version list;
filtering is respected and no record is changed. Application editor/scan cards keep
full data. The Apply filters button explicitly uses a dark blue background/white
text and visible focus outline, fixing light-mode contrast.


Verification of local detector replacement (2026-11-10): browser fixtures 7/7,
local detector plus structure/runtime/i18n checks 30/30, and temporary PostgreSQL
inventory/service checks 17/17 passed. No live organization scan or Docker/cloud
execution was used. No frontend source changed; backend restart is required.
Detection confidence is a rule weight, not a statistical probability. Existing
saved records are preserved, including historical source labels; new scans use
NIST Basis metadata. DOM/JS observations remain bounded by the browser probe.
