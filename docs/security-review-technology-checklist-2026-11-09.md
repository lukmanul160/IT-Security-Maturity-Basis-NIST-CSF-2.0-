# Review Technology Asset dan Compliance Security Checklist

Tanggal: 9 November 2026 (Asia/Bangkok). Cakupan: sumber kedua modul, permission,
assignment/evidence, impor/ekspor Excel, scan pasif/browser, CVE lookup, frontend
rendering dan dependency bersama yang digunakan. Ini review terarah dengan perbaikan
kode dan fixture, bukan sertifikasi ASVS/pentest deployment atau jaminan bebas celah.

## Temuan dan perbaikan

| Area | Temuan | Tindakan dan bukti |
| --- | --- | --- |
| Browser scanner / medium | Halaman dapat mengembalikan snapshot runtime besar melalui CDP; channel sebelumnya tanpa batas payload aplikasi. | WebSocket `ws` langsung, maxPayload 2 MiB, handshake 3 detik, compression off, pending command dibatalkan saat close. Fixture array runtime 3 MiB diblokir, respons 504 tersanitasi. |
| Browser scanner / medium | Ketika target awal internal, script halaman dapat memicu navigasi utama ke aplikasi internal lain. | Document hanya URL awal atau Location redirect HTTP yang telah diterima; navigasi script ke hostname lain ditolak sebelum transport. Fixture membuktikan tidak ada request ke tujuan kedua. Resource internal lintas origin, POST dan metadata tetap diblokir. |
| Evidence / defense in depth | Download checklist belum mengikuti CSP sandbox evidence utama; jenis file hanya berdasarkan metadata. | Attachment, CSP sandbox/default-src none, nosniff dan private/no-store. Upload baru memeriksa magic bytes PDF/gambar/OLE/ZIP selain ekstensi/MIME. Payload HTML dengan nama PDF/gambar ditolak. Ini bukan AV atau validator struktur dokumen penuh. |
| Upload / medium hardening | Pemilik record baru diperiksa setelah file multipart ditampung di RAM. | Otorisasi pembuat/assessor dilakukan sebelum parser multipart dan diulang dalam transaksi row lock. Fixture non-owner ditolak; rollback dan version conflict tetap diuji. |
| Excel / medium | Input 5 MiB dan batas baris belum membatasi ekspansi ZIP atau waktu parser pada UI thread. | Preflight arsip maksimum 256 entry/25 MiB expanded, pemeriksaan actual deflate sizes, Worker khusus dan timeout 15 detik. Fixture ZIP dengan ukuran dideklarasikan berlebih maupun ukuran palsu ditolak, round-trip tetap lulus. |
| Dependency bersama | Audit awal sandbox tidak memberi advisory, tetapi registry live melaporkan 1 critical, 2 high dan 7 moderate (10 paket produksi terdampak). | Patch DOMPurify 3.4.17, Multer 2.5.0 dan pembaruan kompatibel lockfile untuk body-parser, qs, Nodemailer/Vite. Audit produksi akhir: 0 critical/high, 5 moderate. Tidak memakai audit fix --force. |

## Kontrol yang diverifikasi

- API dilindungi autentikasi aplikasi, permission modul/aksi dan origin guard bersama.
  Viewer tidak membuat/mengubah/menghapus atau menjalankan scan. Assessment hanya
  pembuat/admin atau assessor aktif; assessor tidak mengubah struktur kolom definisi.
- Daftar/unduhan assignment dibatasi pembuat/admin/assessor; pemilik template tidak
  otomatis dapat melihat assignment pengguna lain. Reassignment mencabut akses
  assessor sebelumnya. Template sengaja dibagikan kepada pembaca modul.
- Semua SQL pada jalur kedua modul yang ditinjau memakai parameter. ID UUID,
  panjang teks, jumlah baris/kolom/file, pilihan, row identity dan version divalidasi.
- Penyimpanan hasil/file checklist atomik dalam transaksi; stale write/delete ditolak.
  File BYTEA tidak menjadi path eksekusi di direktori publik. Nama file disanitasi.
- Vue merender data teks tanpa v-html untuk evidence/nama/hasil scan. Ekspor Excel
  menyimpan input yang diawali '=' sebagai string; formula impor ditolak.
- Scan memvalidasi HTTP(S), DNS dan address pinning; memblokir loopback, link-local,
  endpoint metadata, kredensial URL dan redirect publik ke internal. TLS diverifikasi.
  Browser profile sementara tanpa login/cookie; jaringan langsung ditutup via proxy
  mati dan DNS rules. Request yang diizinkan diteruskan Node dengan pemeriksaan ulang.
- Scan rate/concurrency, body/header/HTML/asset dan waktu dibatasi. CVE memakai
  endpoint NVD tetap, cache/throttle/timeout/response size; tidak menerima URL API
  sewenang-wenang. Hasil CVE tetap kandidat, bukan penetapan aman/terdampak.

## Risiko tersisa dan batas verifikasi

1. **Dependency moderate terbuka:** archiver, archiver-utils, zip-stream, glob dan
   minimatch. Registry merekomendasikan archiver 8 (major). Kedua modul tidak
   mengimpor archiver secara langsung; modul arsip/backup lain perlu migrasi dan
   regresi tersendiri. Jangan membaca laporan ini sebagai audit npm bersih.
2. Scan internal sengaja mengakses jaringan backend. Pengguna dengan hak create/update
   Technology Asset dapat menjalankannya. Batasi hak tersebut dan gunakan egress ACL/
   segmentasi jaringan deployment untuk target yang boleh dipindai. Pemblokiran
   metadata/DNS pinning bukan pengganti target allowlist organisasi.
3. Pemindaian JS tak tepercaya membutuhkan Chromium/OS yang terus dipatch, user
   non-root dan sandbox aktif. Container runtime, isolation lintas host dan semua
   kemungkinan bypass browser belum diuji. Batas CPU/memori OS tetap disarankan.
4. Evidence belum dipindai antivirus/CDR; magic bytes dapat dipalsukan dan dokumen
   valid dapat mengandung macro/konten aktif. Tidak ada kuota storage per pengguna.
   Upload tetap maksimum 10 file x 10 MiB; kapasitas upload bersama membatasi paralel.
5. Cache/throttle scan/CVE bersifat per proses. Deployment multi-instance memerlukan
   pembatas bersama jika ingin batas global. Data register Technology Asset memang
   dibagikan menurut permission modul; tidak ada isolasi record per pemilik.
6. Tidak membaca .env, memodifikasi data operasional atau memakai restore produksi.
   Tidak ada pentest aktif situs organisasi, provider/cloud/Docker live, uji beban
   besar atau sertifikasi ASVS. Fixture PostgreSQL sementara dan Chrome lokal dipakai.
   Pengujian dilakukan Node 24.19.0 sesuai panduan agen; engine package saat ini
   meminta >=26.13.0 <27 dan mengeluarkan warning. Runtime 26 belum diverifikasi.
7. Kriteria PHP < 7.1.1 adalah aturan inventaris pengguna, bukan database EOL. Versi
   tidak dikenal/prerelease tidak diasumsikan lebih rendah atau aman. Data scan dapat
   disembunyikan/dipalsukan dan hasil parsial tidak menjamin stack lengkap.

## Validasi

- Technology Asset: 15/15 service/model/PostgreSQL sementara, termasuk PHP6.1.1.1
  <7.1.1, perbandingan bagian numerik dan AND/OR aplikasi.
- Checklist/Excel: 11/11, termasuk HTTP multipart/download, row ownership, rollback,
  versi, assignment snapshot, magic bytes dan arsip terkompresi berlebih.
- Browser scanner: 4/4 Chrome nyata dengan respons fixture, meliputi runtime globals,
  metadata/POST, navigasi internal tak disetujui dan snapshot runtime berlebih.
- Mutation guard: 5/5 pada PostgreSQL sementara. Percobaan awal memakai preload yang
  sengaja memblokir database dihentikan lalu dijalankan ulang dengan runner isolasi.
- Keamanan/izin/struktur/i18n/SMTP fixture: 54 lulus, 1 migrasi SMTP integrasi dilewati;
  pemeriksaan akhir tambahan i18n/note links/search/struktur: 40/40 lulus.
- Chrome UI kedua modul: lulus. Technology mencakup lima tab, graph pada tab tersendiri,
  search canvas/global, reuse KnowledgeGraph default, numeric search, language, versi,
  viewer, scan draft/error retention, CVE dan responsive layout. Checklist meliputi
  modal, dua assignment, evidence, worker Excel dan konflik.
- Build frontend lulus; warning script legacy, font runtime dan chunk besar tetap ada.

Rujukan kontrol: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[ws message limits](https://github.com/websockets/ws/blob/master/doc/ws.md).
