# Warna status bersama

`frontend/client/src/services/statusColors.mjs` dipasang oleh `main.js` setelah runtime
workspace siap. Peta label Indonesia/English memilih danger (merah), warning (kuning),
success (hijau), atau neutral (abu-abu). Palet dan kontras terang/gelap ada pada
`styles/status-colors.css`. Label kustom dapat ditambahkan pada peta; gunakan
`data-status-color` pada badge status baru di luar tabel.

Layanan memberi atribut presentasi `data-status-tone` pada kolom status/workflow/
persetujuan/kelengkapan, badge status, dan select status. Header bertingkat memakai
rowspan/colspan. MutationObserver menggabungkan pembaruan dalam satu animation frame;
atribut tidak diamati sehingga pewarnaan tidak memicu pengamatan dirinya sendiri.
Sel tabel yang hanya berisi satu node teks dibungkus badge span; teks asli tetap
dipertahankan. Sel dengan markup memakai elemen status yang sudah ada. Warna hanya
berlaku pada badge, bukan latar seluruh sel. Vue/runtime tetap mengelola nilai datanya. Editor dokumen dan contenteditable dikecualikan.
Level risiko seperti High/Low tetap memakai warna tingkat risiko modulnya.

Verifikasi: `npm run test:status-colors`, `npm run test:status-colors-browser`, dan
`npm run build`. Tes browser memakai fixture tanpa akun/database operasional,
termasuk perubahan DOM, Vue, bahasa, mode gelap, form, dan header tabel bertingkat.
Tes ini tidak mengklaim pemeriksaan manual setiap data pengguna atau deployment.

Hasil verifikasi: unit status dan fixture Chrome lulus; regresi aplikasi 371 lulus, 5 dilewati.
Tes tema dan logika i18n lulus. Tes `i18nCoverage.test.js` masih gagal karena label
antarmuka yang belum ada dalam kamus; perubahan warna tidak menambah label UI baru.

Sel status tidak memakai aksen garis vertikal atau inset box-shadow. Warna teks/latar hanya pada badge;
garis dan latar sel tabel mengikuti tampilan tabel modul. Perubahan CSS
ini diverifikasi dengan build frontend, tanpa pengujian ulang data operasional.

Tampilan badge diverifikasi pada perubahan teks langsung dan pembaruan reaktif Vue.
