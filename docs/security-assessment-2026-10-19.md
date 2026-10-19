# Pengujian keamanan dan perbaikan — 19 Oktober 2026

Pemeriksaan menggunakan dua metode: secure code review terarah dan vulnerability analysis dengan payload HTTP pada server loopback serta fixture. Hasil akhir: 163 tes lulus, 2 tes integrasi dilewati, 0 gagal; npm audit melaporkan 0 advisory. Ini bukan pentest menyeluruh atau jaminan aplikasi bebas kerentanan.

## Ruang lingkup dan metode

Kode yang ditinjau: middleware aplikasi, autentikasi/sesi, provisioning akun, pembatas login, otorisasi rute, error handler, audit, virtual office publik, validasi berkas/storage, dan pola eksekusi proses/rendering. Pembacaan frontend bersifat terarah, bukan pemeriksaan semua sink DOM. Review dilakukan pada working tree yang sudah memiliki perubahan pengguna; perubahan tersebut dipertahankan.

Acuan: [OWASP WSTG stable](https://wstg.owasp.org/stable/4-Web_Application_Security_Testing/), [pengujian SQL injection](https://wstg.owasp.org/stable/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05-Testing_for_SQL_Injection/), dan [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Pemetaan ini merupakan acuan pengujian, bukan sertifikasi ASVS. Severity berikut adalah penilaian kontekstual, bukan skor CVSS hasil eksploit deployment.

## Temuan dan perbaikan

| ID | Risiko | Bukti dan dampak | Perbaikan / status |
| --- | --- | --- | --- |
| SEC-01 | High, password awal bersama (CWE-1392) | `database/users.sql` sebelumnya memasukkan dua akun dengan hash untuk password publik pada semua lingkungan. README dan tes lama mengonfirmasi password tersebut. Instalasi baru dapat diambil alih jika dibuka sebelum password diganti. Tidak dicoba pada akun operasional. | Hapus INSERT akun bawaan; schema tetap idempoten dan akun lama tidak diubah. Admin pertama wajib dibuat memakai `admin:create` dengan password pilihan sendiri. Validator, bcrypt, dan konfirmasi password CLI diuji. **Instalasi lama tetap perlu mengganti password awal jika masih digunakan**; audit ini tidak memodifikasi password/data operasional. |
| SEC-02 | Medium, validasi asal request tidak lengkap (CWE-346 / defense CSRF) | Guard lama hanya membandingkan `URL(origin).host` dengan Host. Skema berbeda pada host/port sama lolos; tanpa Origin, Referer dan Fetch Metadata tidak diperiksa. Ini membuktikan kelemahan guard melalui review; pengambilalihan sesi/eksploit CSRF di browser produksi tidak dibuktikan. | Guard baru membandingkan origin penuh, menolak skema/host/port berbeda, opaque/malformed origin dan userinfo; memakai Referer jika Origin tidak ada serta menolak `Sec-Fetch-Site: cross-site`. Matriks HTTP 96 request mutasi meliputi mode HTTP dan HTTPS di belakang terminator TLS. |

Mode HTTPS pada guard mengikuti konfigurasi cookie Secure, sehingga HTTPS yang diterminasi proxy tetap didukung tanpa mempercayai `X-Forwarded-*` dari sembarang klien. Kombinasi konfigurasi proxy aktual belum diuji. Konfigurasi `SESSION_COOKIE_SECURE=false` berarti aplikasi memang menggunakan origin HTTP; jangan memakainya pada deployment HTTPS. Request non-browser tanpa Origin, Referer, dan Fetch Metadata tetap didukung untuk kompatibilitas integrasi. Proteksi ini bukan token anti-CSRF; SameSite=Lax tetap menjadi lapisan tambahan. Permintaan GET tidak diblokir guard mutasi.

## Payload dan bukti hasil

| Area | Payload / skenario | Hasil dan batas |
| --- | --- | --- |
| SQLi login | `username="' OR '1'='1'--"`, null byte, object `{"$ne":null}`, username 1000 karakter | HTTP 401 sebelum query database. Login fixture normal HTTP 200, query username memakai `$1`. Tidak membuktikan semua query seluruh modul aman pada PostgreSQL nyata. |
| Session forgery / akses anonim | `Cookie: nist_session=forged`, header `X-Forwarded-For` palsu; akses users, backup, file backup, storage settings, notes | HTTP 401; header palsu tidak menghasilkan autentikasi. |
| Eskalasi role | User biasa membaca/membuat users, membaca backup, mengirim `PUT /api/auth/me` dengan `{"role":"admin"}` | HTTP 403 sebelum operasi database bisnis. Advisory lock mutasi memakai fixture terpisah. |
| CSRF/origin | `Origin: https://attacker.invalid`, `Origin: null`, origin beda skema, origin dengan path/userinfo, Referer lintas origin, `Sec-Fetch-Site: cross-site` tanpa Origin | HTTP 403. Origin sah, Referer sah dan integrasi tanpa header browser tetap diterima. POST/PUT/PATCH/DELETE diuji, termasuk expected HTTPS walau koneksi fixture adalah HTTP loopback. |
| Login/logout bisnis | Password fixture benar; pemeriksaan HttpOnly/SameSite; logout dengan origin sah | Login 200, logout 204, token sesi dicabut. Penggantian password/role dan invalidasi sesi juga diuji oleh suite yang sudah ada. |
| Konten aktif | HTML script pada evidence, `javascript:` dalam Markdown, SVG dengan script dalam DOCX | Sandbox response, parser Markdown, dan validasi dokumen diuji pada fixture. Bukan eksekusi payload pada browser nyata. |
| Path traversal / arsip | `../outside`, `a/../b`, `../secret` pada manifest pecahan backup; batch hilang/duplikat/campur/rusak | Ditolak pada validator/fixture; tidak dilakukan restore ke database/storage operasional. |
| Abuse / berkas | Limit login lintas username, limit pergantian password, multipart agregat melampaui kapasitas, PNG tanda tangan invalid/berlebihan | Tes limiter, validasi, dan cleanup lulus. Tidak melakukan DoS terhadap layanan yang berjalan. |
| Dependensi | `npm.cmd audit --json` | 0 info/low/moderate/high/critical dari registry saat pemeriksaan. Tidak meliputi OS, PostgreSQL, paket eksternal tanpa advisory npm, atau kerentanan yang belum diketahui. |

## Regresi alur bisnis

Tes akhir mencakup permission read/create/update/delete, akses evidence, login dan sesi tunggal, CLI admin, Surat Pernyataan dan signature/document handling, Knowledge Notes/import gambar, policy document, storage, audit redaction, transaksi, backup ZIP/pecahan, dan batas ekspor. Dua tes yang dilewati adalah integrasi uploader isolation serta persistence action settings; keduanya memerlukan database nyata dan tidak dihitung sebagai lulus.

Tes backup besar melakukan streaming fixture 501 MiB dan range unduhan file sementara 6 GiB dengan handler restore mock. Ini memverifikasi transport/batas berkas, bukan `pg_restore` nyata. Cloud menggunakan adapter fixture; Docker, S3/GCS, SMTP dan deployment HTTPS tidak diuji langsung.

Fixture tes lama yang sebelumnya membaca website settings melalui database dilengkapi mock eksplisit. Dua tes password/profile memakai fixture advisory lock agar middleware mutasi tetap dieksekusi tanpa PostgreSQL nyata.

## Perubahan operasional

- Instalasi baru: `npm run db:setup`, lalu `npm run admin:create`, kemudian login dengan akun yang dipilih. Docker: setelah startup siap, `docker compose --env-file .env.docker exec app npm run admin:create` dari terminal interaktif. Akun tambahan tetap dikelola melalui Administration.
- Instalasi lama: akun, password, role, dan data tetap dipertahankan. Operator harus mengganti password awal lama yang masih digunakan. Tidak ada reset otomatis atau penghapusan akun.
- Restart backend diperlukan untuk guard baru. Sumber frontend tidak diubah pada pekerjaan ini; build frontend tidak dijalankan dan aset hash tidak diedit.
- Virtual office publik memang diminta oleh dokumentasi `docs/virtual-office.md`: nama/fallback username, role, kehadiran dan deskripsi aktivitas tetap publik. Ini merupakan eksposur privasi yang disengaja dalam desain, bukan bypass otorisasi yang diam-diam diubah. Pembatasan akses akan mengubah kebutuhan fitur dan perlu keputusan produk.

## Mengulang pemeriksaan

```powershell
npm.cmd run test:security-assessment
npm.cmd audit --json
```

Runner memakai `scripts/security-test-isolation.cjs` sebelum modul aplikasi: pembacaan dotenv dinonaktifkan, koneksi/query PostgreSQL nyata ditolak, dan direktori data/upload/backup dialihkan ke temporary. Hanya fixture eksplisit di tes yang dapat menggantikan blokir tersebut. Jangan menjalankan `npm start`, setup DB atau skrip integrasi terhadap database operasional sebagai pengganti pengujian ini.

Bukti: `output/security-assessment-2026-10-19/final-tests.txt` (165 total, 163 pass, 2 skip, 0 fail) dan `npm-audit.json`. Log percobaan `regression.txt` menyimpan percobaan tambahan yang dihentikan: tes audit retention memerlukan PostgreSQL dan tes lock lintas instance menunggu koneksi yang diblokir. `regression-fixtures.txt` setelah perbaikan fixture menunjukkan 44 pass, 0 fail; suite gabungan final adalah hasil penerimaan yang dirujuk. Node yang digunakan: 24.19.0. `git diff --check` lulus.

Verifikasi berikutnya yang belum dilakukan: end-to-end browser seluruh modul, integrasi PostgreSQL disposable (terutama permission persistence, ownership dan advisory lock lintas instance), TLS/proxy nyata, malware scanning berkas umum, serta session/limiter lintas proses. Tidak ada sertifikasi bahwa proses bisnis produksi bebas regresi; hasil yang dapat dibuktikan adalah regresi fixture di atas.
