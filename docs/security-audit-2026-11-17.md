# Pemeriksaan keamanan 17 November 2026

Pemeriksaan ini menjalankan kontrol keamanan otomatis yang tersedia di repository pada
commit kerja saat ini. Skill eksternal `security-audit` yang disebutkan dalam permintaan
tidak tersedia di container ini (tidak ditemukan `security-audit/SKILL.md` di `/workspace`,
`/root`, atau `/opt`), sehingga hasil ini **bukan** pengganti workflow lengkap skill
tersebut dan bukan sertifikasi bahwa aplikasi bebas kerentanan.

## Ringkasan hasil

| Pemeriksaan | Hasil | Keterangan |
| --- | --- | --- |
| Suite keamanan terarah | Lulus | 36/36 tes lulus. Cakupan mencakup autentikasi dan sesi, rate limit login/password, CSRF/SQL injection/role escalation, upload, audit log, backup/restore, worker Excel, cookie produksi, dan akses aset publik. |
| Konfigurasi Docker | Lulus | 10/10 tes lulus untuk cookie, inisialisasi data, proxy, segmentasi jaringan, pembatasan privilege/process/log, dan Host/TLS. Ini pemeriksaan konfigurasi/mock, bukan menjalankan deployment Docker nyata. |
| Suite asesmen keamanan luas | Sebagian | 162 lulus, 1 gagal, 2 dilewati dari 165 tes. Satu kegagalan disebabkan fixture yang mengacu ke `C:/Program Files/PostgreSQL/18/bin/initdb`, sedangkan binary PostgreSQL tidak tersedia di container Linux ini; kegagalan tersebut bukan bukti kerentanan aplikasi. |
| Advisory dependensi npm | Tidak dapat diverifikasi | Endpoint advisory registry mengembalikan HTTP 403, sehingga status advisory lockfile saat ini tidak boleh dinyatakan bersih. |
| Deployment Docker | Diperiksa statis | Segmentasi jaringan dan non-root app sudah baik. Hardening process/log/host diterapkan dalam pemeriksaan ini. Beberapa risiko terbuka memerlukan keputusan operasional atau perubahan bootstrap. |

Tidak ada kerentanan baru yang terkonfirmasi oleh tes otomatis yang berhasil dijalankan.
Kesimpulan ini terbatas pada assertion yang sudah ada; tes yang lulus tidak membuktikan
ketiadaan celah di jalur yang belum diuji.

## Temuan deployment Docker

### Tinggi — kredensial administrator awal dapat ditebak (terbuka)

Instalasi dengan tabel akun kosong membuat akun `admin` dengan password `admin`, juga
pada mode production. Karena Nginx mempublikasikan halaman login ke jaringan pada port
443, ada jendela pengambilalihan penuh sampai operator mengganti password. Instruksi
"segera ganti" tidak menghilangkan risiko deployment otomatis atau instance yang
terlupakan. Bootstrap sebaiknya gagal tertutup dan mewajibkan password acak dari secret
sekali pakai, tanpa menyimpan nilai default di image atau source.

### Sedang — CA lokal tetap online di volume Nginx (terbuka)

Mode HTTPS IP menyimpan `root.key` bersama sertifikat server pada volume yang dapat
ditulis container Nginx. Kompromi pada container/proses Nginx dapat membuka private key
CA yang kemudian dapat digunakan untuk menerbitkan sertifikat lain pada perangkat yang
mempercayai CA tersebut. Untuk deployment organisasi, gunakan sertifikat dari PKI
perusahaan dengan CA key offline; mode CA lokal sebaiknya hanya untuk jaringan terbatas.

### Sedang — image menggunakan tag yang dapat berubah (terbuka)

Image Nginx, Redis, dan PostgreSQL memakai tag tanpa digest. Rebuild pada tanggal berbeda
dapat mengambil byte image berbeda tanpa perubahan repository. Tetapkan digest yang
sudah dipindai dalam proses release dan perbarui secara terencana; jangan mematok digest
secara buta tanpa workflow pembaruan keamanan.

### Sedang — proxy menerima body tanpa batas dan timeout satu jam (diterima sementara)

`client_max_body_size 0`, request buffering off, serta timeout 3600 detik diperlukan
untuk restore besar, tetapi memperbesar biaya koneksi lambat/paralel sebelum pembatas
fitur aplikasi selesai bekerja. Batasi akses Nginx dengan firewall/ACL, monitor koneksi,
dan pisahkan endpoint restore administratif jika deployment menghadapi jaringan tidak
tepercaya.

### Rendah — password database diberikan melalui environment (terbuka)

Compose mewajibkan password nonkosong, tetapi memberikannya sebagai environment kepada
app dan PostgreSQL. Operator dengan hak inspeksi Docker memang sudah berprivilege tinggi,
namun secret file/secret manager memberi rotasi dan pembatasan distribusi yang lebih
baik. Migrasi perlu menjaga kompatibilitas PostgreSQL `_FILE` dan konfigurasi aplikasi.

### Hardening yang diterapkan

- Jaringan database sekarang `internal`, konsisten dengan jaringan cache; keduanya tidak
  mempublikasikan port host.
- Semua service memakai `no-new-privileges`, batas PID, dan rotasi log JSON untuk
  mengurangi eskalasi serta kehabisan proses/disk. App yang sudah berjalan sebagai user
  `node` juga menjatuhkan seluruh Linux capabilities.
- Nginx menolak Host yang tidak sama dengan alamat deployment, menyembunyikan token
  versi, dan mematikan TLS session tickets. Forwarded headers tetap ditimpa di ingress.

Perubahan tersebut mengurangi dampak kompromi tetapi bukan pengganti update image,
firewall host, perlindungan Docker daemon, backup terenkripsi, atau pemantauan runtime.
Docker/Compose CLI tidak tersedia pada environment audit, sehingga image tidak dibangun,
container tidak dijalankan, `nginx -t` tidak dieksekusi, dan paket OS dalam image tidak
dipindai. Validasi yang dilakukan terbatas pada parsing YAML, tes kontrak, dan review sumber.

## Perintah dan hasil

### `npm run test:security`

Hasil: 36 lulus, 0 gagal, 0 dilewati. Suite memvalidasi antara lain pencabutan sesi,
batas password bcrypt, pembatasan login, sandbox konten upload, sanitasi audit,
otorisasi replacement file, keamanan backup/restore, kapasitas upload, worker workbook,
dan konfigurasi cookie produksi.

### `npm run test:docker-config`

Hasil: 10 lulus, 0 gagal, 0 dilewati. Pemeriksaan ini hanya membaca dan menguji
kontrak konfigurasi Docker dengan fixture; container PostgreSQL/Redis dan koneksi
HTTPS nyata tidak dijalankan.

### `npm run test:security-assessment`

Hasil: 162 lulus, 1 gagal, 2 dilewati. Kegagalan berada pada tes seed akun default
karena fixture mencoba menjalankan path Windows `C:/Program Files/PostgreSQL/18/bin/initdb`
yang tidak ada di lingkungan Linux. Dua tes integrasi dilewati karena tidak ada
PostgreSQL fixture yang dapat dipakai. Hasil lulus tetap menunjukkan kontrol unit/mock
yang diuji bekerja, tetapi integrasi database tersebut belum tervalidasi.

### `npm audit --json`

Tidak menghasilkan inventaris advisory karena registry npm menjawab `403 Forbidden`
pada endpoint bulk advisory. Ini keterbatasan layanan/lingkungan, bukan hasil audit
dependensi. Pemeriksaan perlu diulang ketika endpoint registry dapat diakses.

## Batasan dan tindak lanjut

1. Sediakan skill `security-audit` beserta `SKILL.md` di environment apabila workflow
   dan format laporan skill tersebut wajib digunakan, lalu ulangi pemeriksaan sesuai
   seluruh tahap skill.
2. Jalankan ulang `npm run test:security-assessment` dengan PostgreSQL sementara dan
   `initdb` yang sesuai platform agar dua tes integrasi tidak dilewati dan fixture seed
   akun dapat dieksekusi.
3. Ulangi `npm audit --json` dari jaringan yang mengizinkan endpoint advisory npm.
4. Lakukan pemeriksaan manual/static terpisah terhadap kontrol akses lintas modul,
   sink DOM, race condition autentikasi, cache Redis, parser dokumen, dan konfigurasi
   deployment. Suite regresi otomatis ini tidak cukup untuk menutup area tersebut.
5. Jangan menggunakan database, bucket, SMTP, atau Redis produksi saat validasi;
   gunakan fixture sementara dan konfigurasi yang terisolasi.
