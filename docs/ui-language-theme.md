# Bahasa dan tema antarmuka

Bahasa Indonesia dan Inggris menggunakan katalog lokal `frontend/public/i18n.js`. Pilihan disimpan sebagai `nist-basis-language` dan dipakai pada ruang kerja, halaman masuk, beranda, dan kantor virtual. Nama standar, kode kontrol, merek, serta istilah yang sama pada kedua bahasa dipertahankan.

Label halaman, navigasi, formulir, status, pesan validasi, panduan, pertanyaan kuesioner bawaan, judul tab, placeholder, dan label aksesibilitas diterjemahkan. Teks yang dimuat setelah halaman terbuka ditangani MutationObserver. Nilai option tetap memakai kode asli sebelum label diterjemahkan. Data pengguna di input, textarea, editor, nama lampiran, serta elemen `data-no-translate` tidak ditulis ulang.

`NistI18n.locale` mengikuti id-ID/en-US. `dateText` dan `dateHtml` mempertahankan sumber ISO serta memakai Asia/Bangkok secara default; label tanggal diperbarui saat bahasa berubah. Kalender yang memang memakai UTC tetap mempertahankan opsi tersebut. Label canvas memerlukan redraw eksplisit; radar assessment dan label 3D kantor virtual sudah mengikuti perubahan bahasa. Nama pengguna pada label avatar tetap asli.

Light mode memakai latar abu lembut (#e6ecf2), panel (#eef2f6), dan input (#f3f5f8) untuk mengurangi bidang putih menyilaukan. Dark mode mempertahankan panel gelap, termasuk kartu lampiran dan heatmap risiko dengan palet hijau/kuning/merah gelap. Tema tersimpan sebagai `nist-basis-theme`. Gambar unggahan tidak diberi filter peredup. Tampilan cetak tetap memakai latar putih.

Validasi:

- `npm.cmd run test:i18n`: pergantian bahasa, persistensi, tanggal Bangkok, nilai formulir, data pengguna, dan cakupan label statis pada seluruh komponen halaman.
- `npm.cmd run test:ui-language-theme-browser`: navigasi modul dan halaman publik, pemeriksaan dua bahasa dan dua tema, dialog workflow, dan pemindaian bidang terang. Data risiko dan audit pengujian memakai schema sementara, lalu dihapus.
- `npm.cmd test` dan `npm.cmd run build:client`: regresi aplikasi dan build frontend.

Artefak pemindaian: `output/ui-language-theme-audit.json`. Pratinjau: `output/ui-language-theme-dark-preview.png` dan `output/ui-language-theme-light-preview.png`.

Hasil pemeriksaan 13 Oktober 2026: 29 halaman navigasi diuji di browser, tanpa error JavaScript dan tanpa bidang besar yang melewati ambang terang pemindaian. Tes cakupan statis mencakup 31 komponen halaman dan tiga halaman publik. Ambang pemindaian adalah luas lebih dari 1.500 piksel persegi, seluruh kanal RGB di atas 160 pada dark mode atau 249 pada light mode; gambar dan canvas dikecualikan. Pemeriksaan ini melengkapi tinjauan pratinjau, bukan ukuran kenyamanan subjektif.

Tambahkan pasangan terjemahan saat memperkenalkan label baru. Jika istilah sengaja sama, masukkan pengecualian yang jelas pada tes cakupan. Gunakan `data-no-translate` untuk nama dan isi milik pengguna. Jangan menerjemahkan kode status yang dipakai API atau nilai formulir yang disimpan.
