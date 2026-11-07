# Surat pernyataan: sumber browser langsung

File JS di sini adalah sumber yang disajikan langsung, berbeda dari aset hash
`frontend/public/vue/`. Baca dokumentasi surat pernyataan/panduan pengguna sebelum
mengubah kontrak request atau ID DOM. Backend berada pada layanan `statement*`.

- `common.js`: kebutuhan bersama halaman surat pernyataan.
- `admin.js`: pengelolaan jenis/form dan konfigurasi administrasi.
- `employees.js`: pengelolaan data pegawai untuk form.
- `monitoring.js`: pemantauan proses dokumen.
- `portal.js`: portal pengguna.
- `public.js`: halaman publik yang mengikuti pemeriksaan akses pada endpoint.

Katalog AST global mencakup file ini. Perubahan sumber tetap perlu pemeriksaan
permission, label/status UI, data pegawai dan isi dokumen melalui fixture.
Jangan memakai dokumen operasional atau mengirim pesan keluar untuk verifikasi.
