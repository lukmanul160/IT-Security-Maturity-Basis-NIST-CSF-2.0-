# services

Layanan aplikasi/domain. Periksa dependency dan pemakai sebelum mengubah alur. Validasi, persistensi serta integrasi mengikuti kontrak fungsi pada file ini.

Baca `../../docs/CODE_STRUCTURE.md`, kemudian dokumentasi modul yang diubah.
Daftar seluruh file, fungsi, parameter dan dependency ada pada
`../../docs/SOURCE_CATALOG.md` dan `../../docs/source-catalog.json`.

## Kontrak perubahan

- Pertahankan nama ekspor, URL, payload, ID record dan arti status yang sudah dipakai.
- Jelaskan alasan validasi/fallback dan efek samping pada fungsi yang diubah.
- Izin frontend tidak menggantikan pemeriksaan server.
- Verifikasi melalui fixture atau PostgreSQL sementara: `npm run test:isolated`.
- Jangan melakukan restore, pengiriman email atau panggilan cloud operasional sebagai test.

`reminderScheduler.js` menyatukan polling, pencegahan overlap dan retry koneksi untuk empat reminder. Service modul tetap menentukan penerima, jadwal, advisory lock, transport SMTP dan riwayat sukses.
