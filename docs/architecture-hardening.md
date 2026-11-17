# Sesi bersama, dependensi frontend, dan migrasi schema

## Autentikasi antar-replica

`authStateService` menyimpan sesi dan penghitung percobaan autentikasi di
PostgreSQL yang sudah wajib tersedia. Redis tetap cache opsional; tidak ada
fallback sesi ke memori ketika database gagal. Restart Node tidak menghapus sesi.
Cookie dan masa berlaku delapan jam dipertahankan; login baru menggantikan sesi
akun yang sama. Database hanya menyimpan SHA-256 token acak 256 bit.

Pembuatan sesi mengunci baris akun dan memeriksa snapshot password/role hasil
autentikasi. Pembacaan sesi memeriksa akun terkini. Perubahan password, role,
penghapusan akun, dan logout berlaku lintas replica tanpa menunggu cache.
Presence Virtual Office juga disimpan bersama. Operasi sesi sekarang async:
seluruh pemanggil harus `await`, termasuk fixture dan script pengujian.

Rate limit memakai waktu PostgreSQL dan UPSERT atomik. Batas IP login adalah
30 percobaan/15 menit; pasangan IP dan username mempunyai lima percobaan/15 menit
dan direset setelah login berhasil. Percobaan paralel ikut dihitung.
Window pasangan diperpanjang menjadi 15 menit ketika ambang kelima tercapai,
sehingga percobaan lambat tidak memperpendek masa blokir. Password
verification mempunyai namespace terpisah: 30/IP dan 10/akun per 15 menit.
Permintaan berlebih mendapat 429 dan Retry-After; kegagalan store tidak memberi
akses. Key limiter di-hash dan baris kedaluwarsa dibersihkan bertahap.
Limiter portal karyawan dan pengiriman Surat Pernyataan juga memakai store
yang sama, dengan namespace terpisah dan batas sebelumnya tetap dipertahankan.

Restore memakai advisory lock PostgreSQL khusus yang terlihat semua replica.
Login/sesi ditolak saat lock dipegang; migrasi forward dan penghapusan sesi hasil
restore selesai sebelum lock dilepas. Jika pemulihan gagal, lock tetap dipegang
selama koneksi/proses hidup dan deployment harus masuk maintenance. Backup baru
mengecualikan isi `auth_sessions` dan `auth_rate_limits`, tetapi tetap menyimpan
strukturnya. Sesi portal karyawan tetap mengikuti penyimpanan PostgreSQL modulnya.

Pengecekan sesi tidak membatalkan request yang telah berjalan. Restore tetap
memerlukan maintenance dan penghentian trafik seluruh replica. Dukungan sesi
bersama tidak menjadikan semua workload otomatis aman untuk horizontal scaling:
storage upload harus dibagi, ingress harus konsisten, dan operasi administratif
tetap memerlukan koordinasi. Redis cache bukan mekanisme pencabutan sesi.

## Frontend

Implementasi submission guard, panduan langkah TPRM, index record Audit Finding,
dan render detail Audit Finding dipisahkan ke ES module di
`frontend/client/src/services/`. `main.js` mengimpor implementasi secara eksplisit
dan memasang bridge frozen sebelum runtime classic dijalankan. Adapter lama
mempertahankan nama fungsi, pemanggil, dan ID DOM.

`runtime-contracts.json` mencatat binding yang diekspor, dependensi binding antar
fragmen, serta referensi global. Analisis AST membedakan binding lokal dan
parameter yang membayangi nama lain. `check:structure` dan `build:client` menolak
perubahan kontrak yang belum direview. Setelah perubahan yang disengaja:

```powershell
npm.cmd run runtime:contracts
npm.cmd run check:runtime
npm.cmd run build
```

Review diff kontrak sebelum menerima hasil regenerasi. Snapshot bukan alat
untuk menyatakan semua global aman. Ia tidak mendeteksi seluruh dependensi
dinamis, akses properti global, atau perilaku browser. Sebagian besar runtime
masih classic-script dan sebagian komponen tetap memakai v-pre; pemisahan ini
mengurangi dependensi implisit tanpa mengklaim konversi penuh ke Vue deklaratif.

## Migrasi PostgreSQL

DDL service dipindahkan ke SQL terurut di `database/migrations/`. Versi awal
mengadopsi schema legacy dengan statement idempoten sehingga instalasi lama
tidak perlu direset. `migrationService` memvalidasi seluruh checksum, memakai
advisory lock antar proses, dan menerapkan seluruh batch pending beserta ledger
`schema_migrations` dalam satu transaksi. Kegagalan membatalkan DDL dan versi
batch tersebut; server tidak menerima trafik bila startup gagal.

`db:setup` dan startup memakai runner yang sama. Entry point `ensureStore`
service tetap tersedia untuk kompatibilitas, tetapi mendelegasikan schema ke
runner bersama, bukan mendefinisikan DDL sendiri. Seed akun startup berada di `database/account-seed.sql`, tanpa DDL.
Inisialisasi data/seed bisnis
yang sudah ada tetap terpisah dan beberapa masih berjalan saat startup.

```powershell
npm.cmd run db:migrate:status
npm.cmd run db:migrate
```

Status tidak membuat ledger pada database yang belum mempunyai ledger.
Tambahkan file SQL baru dengan nomor lebih tinggi dari versi terakhir, termasuk
`0999-shared-auth.sql`. Jangan mengedit/menghapus versi yang sudah diterapkan.
SQL migrasi harus transactional; jangan memasukkan CREATE INDEX CONCURRENTLY,
perintah koneksi, atau COMMIT sendiri. Checksum menormalkan CRLF/LF.

Prosedur release: siapkan backup lengkap database, file, konfigurasi dan kunci;
hentikan trafik serta seluruh replica versi lama; jalankan migrasi memakai
artifact release yang sama; mulai replica baru; periksa health dan login.
Cookie dari sesi memori versi lama memerlukan login ulang satu kali. Jangan
mencampur versi lama yang masih menerima sesi lokal dengan versi baru.

Tidak ada rollback destruktif otomatis. Jika migrasi SQL gagal, transaksi batch
di-rollback dan artifact dapat diperbaiki sebelum dicoba kembali. Jika migrasi
sukses tetapi release bermasalah, gunakan perbaikan forward; pemulihan backup
hanya pada prosedur maintenance terkoordinasi, bukan penghapusan ledger atau
restore database produksi untuk pengujian. Uji restore penuh di lingkungan
sementara sebelum mengandalkannya sebagai rencana pemulihan.

## Verifikasi dan batas

Test `sharedAuth` memakai PostgreSQL sementara untuk sesi bersama, token hash,
pencabutan, expiry, perubahan kredensial, limit paralel, dan lock restore.
Test migrasi memeriksa concurrency, pengulangan, checksum, serta rollback DDL
dan ledger. Test keamanan lama memakai test double eksplisit; tidak ada mode
memori otomatis di production. Unit test storage cloud memakai mock.

Hasil verifikasi lokal 17 November 2026:

- Regresi penuh `npm run test:isolated`: 459 lulus, 5 dilewati, 0 gagal (464 tes).
- `npm run test:security`: 36 lulus, tanpa gagal atau skip.
- Suite Surat Pernyataan terisolasi: 21 lulus, tanpa gagal atau skip.
- Fixture Chrome TPRM: lulus dengan API fixture dan sumber aktual.
- `npm run build`, pemeriksaan struktur/katalog, dan knowledge graph: lulus.
- Job CI architecture ditambahkan untuk fixture PostgreSQL dan model frontend;
  workflow GitHub tersebut belum dijalankan dari sesi ini.

Build frontend berhasil pada Node 24.19.0 di host pengujian; warning script
legacy, font runtime, dan chunk besar tetap ada. Ini tidak membuktikan dukungan
semua versi Node; engine repository tetap mengikuti package.json. Docker/cloud,
load balancer nyata, dan restore database operasional tidak diuji atau diubah.
