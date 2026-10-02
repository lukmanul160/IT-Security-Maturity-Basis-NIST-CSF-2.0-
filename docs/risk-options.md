# Pengelolaan Pilihan Risk Management

Tab ketiga **Pengelolaan Pilihan** memuat pilihan Effected asset, Risk category,
Nama perangkat, Risk owner, dan Treatment action. Pengguna dapat memfilter jenis,
menambah pilihan, mengedit nama/jenis/urutan, serta menghapus pilihan yang belum
digunakan. Perubahan langsung diperbarui pada dropdown formulir risk register.

Pilihan yang sedang digunakan tidak dapat dihapus atau diganti nama/jenisnya;
urutan tetap dapat diperbarui. Nilai lama yang hanya terdapat dalam risk register
ditampilkan sebagai **Dari risk register** dengan aksi **Simpan pilihan** untuk
mendaftarkannya ke daftar pilihan. Izin create/update/delete mengikuti pengaturan
aksi Risk Management. Kegagalan API dan nama duplikat ditampilkan pada tab.

Sumber data memakai tabel `risk_dropdown_options` dan nilai yang sudah tercatat
di `risk_register`. ID pilihan yang tersimpan diprioritaskan ketika daftar
digabungkan. Tidak ada fallback statis yang memunculkan kembali pilihan terhapus.

Verifikasi: `node --test test/riskDropdownService.test.js`,
`node scripts/test-risk-options-browser.js`, `npm run build:client`.
Tes browser memakai tabel terisolasi dalam schema sementara dan membersihkannya.
