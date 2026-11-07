# controllers

Adapter HTTP. Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.

Baca `../../docs/CODE_STRUCTURE.md`, kemudian dokumentasi modul yang diubah.
Daftar seluruh file, fungsi, parameter dan dependency ada pada
`../../docs/SOURCE_CATALOG.md` dan `../../docs/source-catalog.json`.

## Kontrak perubahan

- Pertahankan nama ekspor, URL, payload, ID record dan arti status yang sudah dipakai.
- Jelaskan alasan validasi/fallback dan efek samping pada fungsi yang diubah.
- Izin frontend tidak menggantikan pemeriksaan server.
- Verifikasi melalui fixture atau PostgreSQL sementara: `npm run test:isolated`.
- Jangan melakukan restore, pengiriman email atau panggilan cloud operasional sebagai test.
