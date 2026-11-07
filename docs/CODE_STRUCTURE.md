# Struktur kode dan panduan pemeliharaan

Standar pemeliharaan berlaku untuk seluruh sumber backend dan frontend.
MVP di sini berarti struktur sederhana dengan tanggung jawab yang jelas.
Backend mempertahankan routes ? controllers ? services ? PostgreSQL;
frontend mempertahankan Vue dan runtime classic-script yang sudah digunakan.

## Peta folder

| Lokasi | Tanggung jawab / kapan diedit |
| --- | --- |
| `src/server.js`, `src/app.js` | Startup dan perakitan Express |
| `src/routes/` | URL, middleware autentikasi dan permission |
| `src/controllers/` | Adapter request/response; delegasikan aturan ke service |
| `src/services/` | Kasus penggunaan, transaksi, integrasi storage/email |
| `src/shared/` | Aturan/perhitungan yang dapat diuji tanpa HTTP/database |
| `src/config/`, `src/middleware/` | Konfigurasi dan perilaku lintas request |
| `database/` | SQL schema dan provisioning; baca dokumentasi sebelum migrasi |
| `frontend/client/src/workspace/components/` | Markup Vue; ID DOM menjadi kontrak runtime |
| `frontend/client/src/workspace/features/` | Logika fitur dikelompokkan menurut modul |
| `frontend/client/src/workspace/runtime-parts.json` | Manifest tunggal urutan classic-script untuk aplikasi dan fixture |
| `frontend/client/src/workspace/runtime.js`, `runtime-source.js` | Memuat dan merangkai sumber sesuai manifest |
| `frontend/client/src/services/` | Utilitas/frontend ES modules yang sudah terpisah |
| `frontend/client/src/styles/` | Styles sumber frontend |
| `frontend/client/src/workspace/source.html` | Layout markers, shared styles dan enhancements legacy |
| `frontend/client/src/workspace/generated/` | Hasil prepare; jangan edit manual |
| `frontend/public/vue/` | Hasil build Vite; jangan edit manual |
| `frontend/public/` | Campuran aset statis sumber dan hasil build; periksa asal file sebelum edit |
| `test/` | Unit/regresi dengan fixture/mock |
| `scripts/` | Build, provisioning dan pengujian browser/integrasi |
| `docs/` | Kontrak modul, panduan operasi dan batas verifikasi |
| `templates/` | Template aplikasi; cek pemakai sebelum mengubah format |

`data/`, `upload/`, `backup/`, `.env` dan konfigurasi instalasi bukan fixture.
Jangan membaca kredensial atau mengubah data operasional untuk verifikasi.
`node_modules/` bukan sumber aplikasi. Folder sementara/output perlu diperiksa
asal dan isinya sebelum dibersihkan; jangan menghapusnya sebagai bagian refactor.

## Kontrak file dan fungsi

- Awali file nontrivial dengan tujuan, dependency penting, serta batas tanggung jawab.
- Nama file menyatakan tugasnya; hindari file `utils`/`manager` serbaguna.
- Fungsi domain menerima data eksplisit dan mengembalikan hasil tanpa DOM/network.
- Fungsi tampilan mengubah data menjadi markup; escape teks pengguna pada batas HTML.
- Controller menangani HTTP, service mengatur kasus penggunaan dan transaksi.
  Jangan menambah repository layer bila hanya meneruskan satu query tanpa manfaat.
- Dokumentasikan input/output, efek samping, fallback dan alasan aturan penting.
  Komentar menjelaskan *mengapa* atau kontrak; hindari mengulang setiap baris kode.
- Nilai tidak lengkap harus tetap dibedakan dari skor nol, risiko rendah atau keputusan sah.
- Server tetap berwenang atas permission dan validasi; panduan frontend bersifat informatif.
- Pada classic-script jangan menambah import/export atau memindahkan listener sembarangan.
  Perubahan urutan runtime harus disertai pemeriksaan fixture dan browser.

Contoh yang sudah diterapkan: `features/tprm/workflow-guidance.js` menghitung
langkah, `workflow-guidance-view.js` merender HTML, `lifecycle.js` mengelola dialog/API.
Lihat peta lebih rinci di `features/tprm/README.md`.

## Cara mengerjakan perubahan

1. Periksa `git status`; baca README, AI_HANDOFF, dan dokumen modul terkait.
2. Telusuri satu alur dari UI ? handler ? route/controller ? service ? SQL.
3. Catat kontrak yang harus dipertahankan: ID DOM, endpoint, payload, izin, dan state.
4. Pisahkan satu tanggung jawab pada satu waktu; pindahkan seluruh pemakai dan fixture.
5. Tambah/perbarui test yang membuktikan hasil, termasuk kasus gagal penting.
6. Jalankan test terarah, `npm run build` bila frontend berubah, lalu regresi terkait.
7. Catat hasil aktual dan batas uji; jangan menyatakan browser/cloud/produksi lolos
   hanya karena unit test atau build berhasil.

## Penerapan dan batas arsitektur

| Tahap | Fokus | Syarat selesai |
| --- | --- | --- |
| 1 (diterapkan) | Peta proyek, kontrak komentar dan panduan lokal seluruh kelompok fitur/lapisan backend | Katalog AST dan pemeriksaan keberadaan panduan |
| 2 (diterapkan) | Render, pembacaan form dan orkestrasi API TPRM dipisahkan | Fixture aktor/payload dan pemeriksaan runtime |
| 3 (diterapkan) | Assessment/gap, risk dan fitur lain memiliki peta fungsi/dependency serta komentar pada batas utama | Katalog aktual, parsing sumber dan regresi |
| 4 (diterapkan) | Tipe tombol Vue eksplisit, nama import runtime deskriptif, quality gate bersama | Audit AST seluruh Vue dan kompilasi runtime gabungan |
| Batas yang dipertahankan | Classic-script frontend masih berbagi lexical scope; sebagian Vue masih berukuran besar | Migrasi ES module atau pemecahan komponen lanjutan memerlukan desain dependency/reaktivitas tersendiri |

Seluruh file sumber masuk katalog, tetapi katalog bukan klaim bahwa setiap helper
memiliki penjelasan bisnis lengkap atau semua komponen telah dipecah. Struktur
fitur/lapisan yang sudah ada dipertahankan; tidak ada perubahan schema produksi
atau perpindahan data. Kode generated tidak menjadi sumber pemeliharaan.

## Standar konsistensi fungsi dan UI

| Aspek | Kontrak |
| --- | --- |
| Nama fungsi | `render...` menampilkan, `read...` membaca form, `load...` mengambil data, `save...` mengirim perubahan; helper domain memakai nama hasil/perhitungan |
| Input dan state | Bedakan snapshot tersimpan, draft form, dan respons server; jangan menyebut draft sebagai tersimpan |
| Tombol | `type="button"` untuk navigasi; `type="submit"` untuk aksi form; primary `button button-accent`, secondary `button button-quiet`, shortcut `attachment-action-button` |
| Navigasi | State tab aktif hanya pada tombol tab; shortcut tidak diberi `aria-selected` |
| Form | Label jelas; read-only menonaktifkan kontrol; izin dan aktor tetap dicek server |
| Pesan | Jelaskan masalah, tindakan perbaikan, dan lokasi/aktor yang diperlukan; gunakan area status untuk hasil simpan |
| Data pengguna | Escape pada batas HTML; jangan menganggap nama akun, catatan, atau dokumen sebagai markup |
| Tampilan | Pakai kelas panel/form/tombol dan token tema yang sudah ada; hindari CSS inline baru yang menggandakan gaya global |
| Perubahan | Uji fungsi, payload, permission dan interaksi browser sesuai dampak; dokumentasikan batas pemeriksaan |

Penerapan tahap 1: shortcut panduan TPRM dipisah dari atribut tab, sehingga
navigasi tidak ikut menerima state/kelas tab aktif. Fixture memeriksa escaping,
shortcut, aktor, payload dan read-only. Audit konsistensi seluruh layar lama
memerlukan fixture browser dan pemeriksaan visual terpisah dari audit statis.

## Perintah pemeliharaan

- `npm run docs:source`: buat ulang `SOURCE_CATALOG.md` dan `source-catalog.json`
  dari AST semua JS/MJS/Vue sumber; tidak menjalankan modul aplikasi.
- `npm run check:structure`: validasi syntax/urutan runtime, cakupan fragment,
  nama import, panduan fitur, tipe tombol Vue, dan katalog yang kedaluwarsa.
- `npm run test:isolated`: jalankan daftar `npm test` memakai cluster PostgreSQL
  sementara dan direktori file per worker; `.env` tidak dimuat. Binary PostgreSQL
  harus tersedia (Windows: `PERF_PG_BIN`, default instalasi PostgreSQL 18).
  Pool pengujian memakai batas koneksi 30 detik untuk startup fixture yang lambat;
  ini tidak mengubah timeout pool aplikasi.
- `npm run build`: bangun ulang frontend sesudah mengubah sumber.

CI security menjalankan pemeriksaan struktur sebelum build. Runner terisolasi
membuat schema kosong dari `database/schema.sql`, tidak menjalankan scheduler,
tidak merestore backup, dan membersihkan cluster/direktori temporernya. Hasil
test aktual dan batas lingkungan dicatat di AI_HANDOFF; keberadaan command
bukan bukti bahwa suite sudah lulus pada setiap host.

Sumber JS yang disajikan langsung di `frontend/public/statements/assets/` dan
`frontend/public/virtual-office/assets/` juga memiliki panduan lokal dan masuk
katalog. Three.js/OrbitControls hasil penyalinan dependency tetap dikecualikan.

## Pemisahan workflow dan manifest bersama

Risk Management memisahkan aturan/panduan (`workflow-model.js`), tampilan (`workflow-view.js`), dan controller (`workflow.js`). Assessment Gap memakai `gap-model.js`, `gap-view.js`, dan `gaps.js`. Model risk masih membaca identitas/izin runtime dan tanggal; pemisahan ini mempertahankan shared scope, bukan isolasi ES module.

Manifest `runtime-parts.json` mencatat 67 fragment dalam urutan produksi. Tambahkan sumber baru ke manifest; fixture Node membaca grup melalui `scripts/lib/runtime-manifest.cjs`. Jangan menyalin daftar urutan ke fixture. `npm run test:structure` memeriksa kontrak manifest dan perakitan sumber.
