# Upgrade Node.js 6 November 2026

Target runtime: Node.js 26.13.0 LTS (rilis stabil terbaru pada saat pemeriksaan),
npm 11.20.0. Rilis 27 alpha tidak digunakan. Sumber versi:
https://nodejs.org/dist/index.json.

Dockerfile memakai `node:26.13.0-trixie-slim` pada tahap build dan runtime.
Versi dipatok agar hasil build dapat diulang; tag diverifikasi tersedia melalui
Docker Hub registry. CI dan `.nvmrc` memakai versi yang sama. Engine aplikasi
memerlukan `>=26.13.0 <27`. Upgrade berikutnya perlu memperbarui semua lokasi ini.

Pada server Docker yang sudah berjalan:

```text
docker compose --env-file .env.docker build --pull app
docker compose --env-file .env.docker up -d --no-deps app
docker compose --env-file .env.docker exec app node --version
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 app
```

Binary Windows dipasang per pengguna pada
`%LOCALAPPDATA%\Programs\nodejs\node-v26.13.0-win-x64` dan diverifikasi dengan
SHA-256 dari distribusi resmi. Instalasi sistem lama di `C:\Program Files\nodejs`
memerlukan administrator untuk diganti. User PATH sudah ditambahkan, tetapi
system PATH dapat tetap mendahului user PATH. Untuk memakai versi baru dalam
terminal PowerShell saat ini:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs\node-v26.13.0-win-x64;" + $env:Path
node --version
npm.cmd --version
```

Docker tidak tersedia pada host verifikasi. Pemeriksaan konfigurasi dan registry
bukan bukti build atau startup container berhasil. Database operasional tidak
digunakan untuk pengujian upgrade ini.

## Hasil verifikasi

- `npm.cmd ci --no-audit --no-fund` berhasil, 465 paket terpasang.
- `npm.cmd run build` berhasil. Peringatan dependency deprecated, loader
  `module.register()`, script legacy, font runtime dan chunk besar masih ada.
  npm juga melaporkan install scripts dependency yang belum masuk allowScripts;
  build tetap berhasil tanpa mengubah kebijakan tersebut.
- Test konfigurasi Docker/cookie: 5 lulus.
- `node scripts/performance-all-modules.cjs --regression-only`: 402 test,
  396 lulus, 5 dilewati, 1 gagal karena fixture Risk Dashboard tidak menyediakan
  `document`. Fixture diperbaiki agar sesuai form edit yang membuka section.
  Pengujian ulang `riskDashboard.test.js`: 9 lulus, 0 gagal. Suite penuh tidak
  diulang setelah perbaikan fixture; hasil awal ada pada
  `output/performance-regression-postgres.tap`.
- Pemeriksaan sintaks server/app/docker-start serta `git diff --check` lulus.

Percobaan awal suite tanpa PostgreSQL dihentikan karena test integrasi memang
memerlukan database. Hasil regresi di atas memakai cluster PostgreSQL sementara
milik harness proyek; cluster dihentikan dan folder sementaranya dibersihkan.
