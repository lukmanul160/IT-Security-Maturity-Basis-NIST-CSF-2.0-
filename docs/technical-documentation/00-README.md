# Dokumentasi teknis NIST Basis / BLACKOWL

Tanggal pemeriksaan: **9 Oktober 2026**, zona waktu Asia/Bangkok. Basis: source workspace saat ini, termasuk perubahan lokal. Dokumentasi berbahasa Indonesia; nama field, enum, dan endpoint dipertahankan sesuai kode.

## Isi paket

- [Infrastruktur](01-INFRASTRUCTURE.md): runtime, Docker, jaringan, volume, environment, integrasi, dan operasional.
- [Aplikasi](02-APPLICATION.md): modul, struktur kode, alur bisnis, lifecycle, hak akses, dan frontend.
- [API](03-API.md): seluruh **191 endpoint HTTP API** dari 24 kelompok, autentikasi, input, response, dan contoh.
- [Database dan relasi](04-DATABASE.md): tabel, kolom, foreign key, constraint, JSONB, serta migrasi.
- [Keamanan dan praktik rekayasa](05-SECURITY.md): temuan, perbaikan, kontrol yang ada, dan batas verifikasi.
- [Operasi dan pengujian](06-OPERATIONS.md): instalasi, rilis, backup, restore, troubleshooting, dan quality gate.
- [Lampiran implementasi API](07-API-IMPLEMENTATION.md): deklarasi route dan kontrak handler dari source untuk setiap endpoint.
- [Katalog API JSON](api-catalog.json): inventaris yang dapat diproses alat lain; bukan spesifikasi OpenAPI hasil validasi schema.
- [Paket dokumentasi ZIP](NIST-Basis-Documentation-2026-10-09.zip): seluruh dokumen dan diagram.
- [Dokumen PDF](NIST-Basis-Dokumentasi-Teknis.pdf): siap dibaca dan dicetak.
- [Dokumen HTML lengkap](NIST-Basis-Dokumentasi-Teknis.html): dapat dibuka offline dan dicetak.

Folder `images/` menyediakan enam diagram dalam **SVG** untuk kualitas vektor dan **PNG resolusi 2x** untuk presentasi. Diagram menampilkan arsitektur aktual, bukan data perangkat atau topologi produksi pengguna.

## Cakupan dan cara memperbarui

Inventaris API dibaca dari router Express yang terdaftar, termasuk route aset yang dibentuk dengan loop. Kamus database berasal dari DDL dan migrasi source; bukan dump database produksi. Kredensial, isi `.env`, record bisnis, dan upload pengguna tidak disertakan.

Jalankan dari root proyek:

```powershell
node scripts/document-api-catalog.js
python scripts/build-technical-documentation.py
```

Generator gambar membutuhkan Pillow dan font Arial pada Windows. PDF dibuat dari HTML melalui browser. Perubahan setelah tanggal pemeriksaan perlu regenerasi dan review. Rancangan produksi/peningkatan diberi label **rekomendasi**, sehingga tidak dianggap sudah terpasang.
