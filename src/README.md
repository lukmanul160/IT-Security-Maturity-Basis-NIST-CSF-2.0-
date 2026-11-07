# Backend

CommonJS, Express 5, PostgreSQL. Peta lengkap: `../docs/CODE_STRUCTURE.md`.

Alur: server ? app ? routes ? controllers ? services ? PostgreSQL/integrasi.
Routes menetapkan URL dan middleware, controller mengadaptasi HTTP, service
memiliki aturan kasus penggunaan/transaksi, shared berisi perhitungan murni.
Config dan middleware menangani kebutuhan lintas modul.

Cari nama modul yang sama di routes/controllers/services dan test sebelum edit.
Pertahankan API, permission, audit dan semantik transaksi saat memisah file.
Jangan menginisialisasi koneksi database dari helper domain murni. Jangan memakai
.env atau data operasional sebagai fixture; gunakan panduan pengujian modul.
