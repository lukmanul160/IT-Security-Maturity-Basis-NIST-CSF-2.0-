# Review keamanan dan praktik industri

Tanggal: 9 Oktober 2026. Scope: source aplikasi, dependency audit npm, relasi vendor aset, transaksi reset risiko, konfigurasi build, dan pengujian regresi. Ini bukan sertifikat kepatuhan, pentest deployment, atau jaminan bebas semua kerentanan.

## Temuan dan perubahan pada pemeriksaan ini

| Temuan | Penanganan | Bukti |
| --- | --- | --- |
| Advisory Vue/server-renderer, proxy-addr, source-map-js | npm audit fix kompatibel; minimum Vue dinaikkan ^3.5.42; lockfile diperbarui | output/security-audit-2026-10-09-before.json dan after.json |
| Penyimpanan vendor dan linked risks belum atomik | Create/update TPRM memakai satu client dan transaksi; kegagalan relasi membatalkan perubahan vendor | test/databaseIntegrityHardening.test.js |
| Reset register memakai pool.query BEGIN terpisah | Satu client checkout dipakai untuk seluruh transaksi; rollback/release | test/databaseIntegrityHardening.test.js |
| Vendor pengelola aset hanya ID di JSONB | Kolom generated managed_vendor_id dengan FK RESTRICT dan index; vendor opsional tetap null | src/services/assetManagementService.js |
| Delete vendor ber-FK dapat memberi error internal | Constraint conflict menjadi 409 dengan instruksi lepaskan relasi | src/services/tprmService.js |
| Potensi injeksi atribut class dari status sertifikasi legacy | Token class dibatasi a-z/0-9/underscore/hyphen; berlaku juga pada rating risiko dan vendor | test/databaseIntegrityHardening.test.js |
| Source map frontend tersedia pada build | sourcemap false; generated build tidak menerbitkan .map | frontend/client/vite.config.js |

Audit dependency setelah update melaporkan **0 advisory npm** pada lockfile saat pemeriksaan. Status ini hanya cakupan advisory yang dilaporkan npm, bukan bukti seluruh kode aman. Vue SSR tidak digunakan sebagai arsitektur runtime aplikasi ini; patch tetap diterapkan terhadap paket terpasang. Proxy trust pada app belum diaktifkan, tetapi paket rentan tetap diperbarui.

Referensi advisory: [Vue](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6), [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Detail applicability perlu dibedakan dari severity paket; tidak diklaim terjadi eksploit pada deployment pengguna.

## Kontrol keamanan yang sudah ada

| Area | Implementasi | Batas |
| --- | --- | --- |
| Authentication | Bcrypt, token random32 byte, cookie HttpOnly/SameSite, lifetime8 jam, invalidasi sesi | In-memory per proses; belum SSO/MFA |
| Authorization | Guard backend Read/Create/Update/Delete, admin-only, ownership evidence | Belum tenant partition/RLS organisasi |
| Login abuse | Limit per IP dan username; blokir setelah kegagalan; shared budget password endpoints | Per proses; shared limiter diperlukan untuk scale-out |
| SQL | Values parameterized; dynamic identifier hanya map/whitelist domain | DDL dan custom schema perlu review setiap perubahan |
| Data integrity | PK/FK/UNIQUE/CHECK, transaksi, advisory lock, optimistic version | Beberapa relasi JSONB tetap logical references |
| HTTP | nosniff, DENY frame, no-referrer, permissions policy; HSTS production + Secure | HTTPS bergantung deployment; bukan TLS terminator bawaan |
| Origin/CSRF | Mutasi dengan Origin beda host ditolak; SameSite cookie | Tidak ada token CSRF khusus; missing-Origin diterima saat ini |
| File access | Auth/owner, path normalization, upload constraints, CSP sandbox file responses | Generic office/PDF belum malware scan |
| Upload abuse | 4 active/process, 2/account, stream aggregate cap, temporary cleanup | Kapasitas disk/timeout deployment tetap perlu diuji |
| Content rendering | Vue interpolation, escapeHtml, DOMPurify pada rendering rich content terkait | Review seluruh innerHTML bukan pembuktian formal semua sink |
| Secrets | SMTP AES-256-GCM dengan key di data; cloud credentials runtime | Key/env perlu ACL dan salinan recovery terpisah |
| Audit | Request events, requestId, credential redaction, durable fallback queue | At-least-once; crash window dan duplikasi masih mungkin |
| Recovery | Dump semua tabel, ZIP metadata+file, restore invalidasi sesi | Restore file dapat parsial jika storage gagal; perlu retry terukur |

## Acuan praktik industri

Review menggunakan [OWASP ASVS](https://owasp.org/projects/asvs) sebagai acuan ruang lingkup kontrol aplikasi, [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) untuk least privilege dan pemeriksaan izin per request, serta [node-postgres Transactions](https://node-postgres.com/features/transactions) untuk transaksi satu client. Pemetaan ini adalah acuan review, bukan penilaian lengkap atau klaim memenuhi seluruh requirement ASVS.

## Praktik coding dan review

Boundary HTTP harus memvalidasi input, parameter ID, ukuran dan tipe; domain service menghitung ulang nilai turunan serta memeriksa referensi. SQL values selalu parameterized. Setiap transaksi memakai satu client dan finally release. Mutasi multientitas harus atomik atau jelas melaporkan partial result. Server permission wajib, UI permission hanya membantu UX. Jangan interpolate konten pengguna ke HTML/CSS/URL tanpa encoding sesuai konteks.

Perubahan DB menggunakan additive migration dan backfill tervalidasi; perubahan destructive membutuhkan rencana recovery. File source frontend diedit, hasil build digenerasi. Lockfile di-review, minimum versi aman dipertahankan, audit diulang saat rilis. Jangan commit secret, cookie, dump bisnis, atau log sensitif.

## Pekerjaan keamanan yang belum terverifikasi / rekomendasi

- Pentest terhadap deployment HTTPS/proxy aktual, session/cookie, IDOR, CSRF, injection, XSS, dan file preview.
- Uji S3/GCS/NAS/SMTP nyata dengan least-privilege runtime credentials, timeout dan failure behavior.
- Content Security Policy workspace yang kompatibel dengan runtime lama dan rich editor; CSP ketat belum dipaksakan untuk seluruh workspace.
- Pemeriksaan magic bytes semua dokumen, antivirus/quarantine, quota disk, dan uji upload paralel/beberapa akun.
- Shared session/limiter dan revocation lintas instance sebelum menjalankan multi-worker/replica.
- Normalisasi relasi logical JSONB bila perlu; formal tenant isolation bila aplikasi dipakai banyak organisasi.
- Infrastruktur DB role provisioning vs runtime least privilege. Role runtime startup sekarang membutuhkan hak DDL; Compose belum memisahkannya.
- Validasi backup/restore rehearsal, enkripsi arsip dan retensi off-host, serta monitoring antrean audit.

Daftar ini merupakan pekerjaan yang nyata belum dibuktikan dalam audit, sehingga laporan tidak menyatakan aplikasi "tanpa celah". Lihat dokumen keamanan historis di parent docs untuk perubahan sebelumnya; status terkini di bab ini dan bukti test yang dihasilkan.
