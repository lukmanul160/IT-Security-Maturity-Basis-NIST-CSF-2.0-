# Threat Modelling

Sidebar **Threat Modelling** membuka editor diagram data flow dengan panel
Shapes, kanvas SVG bergaris bantu, toolbar, dan Properties. Komponen yang
tersedia: external entity, process, service/API, data store, trust boundary,
dan note. Klik atau drag dari palette, geser komponen pada kanvas, dan gunakan
handle sudut kanan bawah untuk resize. Posisi mengikuti grid 20 px. Connect
membuat panah dari komponen sumber ke komponen tujuan; label panah dapat diedit.

Canvas width/height dapat diatur 400–12000 px dan tersimpan bersama diagram.
Ukuran baru harus tetap memuat seluruh shape. Diagram lama memakai ukuran
2400 × 1600 px. Slider Editor height mengatur tinggi area kerja pada layar.
Full screen memperluas editor; Exit full screen atau Esc mengembalikannya.
Jika API fullscreen browser tidak tersedia, editor tetap diperluas dalam halaman.

Properties menyimpan label, deskripsi, warna, posisi, ukuran, serta daftar
ancaman STRIDE per komponen atau aliran data. Setiap ancaman memuat kategori,
severity, status, dan mitigasi. Threat register merangkum seluruh ancaman.
Example diagram menyediakan contoh aplikasi web yang dapat disesuaikan.

Panel Stencils menyediakan 59 elemen yang dikelompokkan dan dapat dicari:
process, external interactor, data store, data flow, trust line boundary,
trust border boundary, dan annotation. Pilih stencil data flow (misalnya HTTPS),
lalu klik komponen sumber dan tujuan. Trust line ditampilkan sebagai garis
putus-putus, sedangkan trust border sebagai area pembatas.

Katalog dan default Element properties berasal dari template resmi Microsoft
[SDL TM Knowledge Base Core 4.1.0.11](https://github.com/microsoft/threat-modeling-templates/blob/master/default.tb7),
dengan atribut turunan dan override tiap subtype. Pilihan pertama atribut menjadi
default; atribut Static ditampilkan read-only. Out of scope default No dan
alasan scope kosong. Nilai properti dapat diedit, divalidasi server, dan tersimpan
di JSON diagram bersama stencil ID. Diagram lama tanpa metadata stencil tetap
dapat dibuka. Ikon dan renderer menggunakan tampilan aplikasi ini; katalog ini
tidak menambahkan analisis ancaman otomatis Microsoft atau import format .tm7.

Save menyimpan diagram dan ancaman ke `threat_models` di PostgreSQL. Beberapa
diagram dapat dipilih dari dropdown. Versi optimistis mencegah save menimpa
perubahan editor lain. Perubahan lokal tetap tersedia bila save gagal dan
dapat diexport sebelum memuat ulang. Backup PostgreSQL lengkap mencakup tabel
ini secara otomatis. Tabel dibuat saat startup dan tersedia di schema setup.

Import JSON memvalidasi format dan diagram sebelum memuat sebagai diagram baru;
pengguna harus memilih Save untuk menyimpan. Export JSON mencakup desain dan
ancaman, Export SVG menyimpan gambar vektor, dan Report / PDF menghasilkan
laporan HTML yang memuat diagram serta threat register untuk cetak/simpan PDF.
Format JSON ini khusus Threat Modelling, bukan format draw.io XML.

Izin `threat-modelling` mengikuti pengaturan role aplikasi. Viewer dapat membaca
dan export; admin/approver/editor/user dapat membuat dan memperbarui sesuai
assignment. Delete diagram secara default hanya admin/approver. API memeriksa
izin setiap aksi. Undo/redo dan penghapusan elemen berlaku pada draft; database
hanya diperbarui saat Save. Ctrl+S menyimpan, Ctrl+Z undo, Ctrl+Shift+Z redo,
Delete menghapus pilihan, Esc membatalkan mode koneksi.

Pengujian: `node --test test/threatModelService.test.js`,
`node scripts/test-threat-modelling-browser.js`, dan `npm run build:client`.
Tes browser memakai schema PostgreSQL sementara untuk diagram uji dan session
lokal pada server pengujian terpisah; schema dihapus setelah pengujian.

Canvas menggunakan viewport tanpa batas ukuran halaman. Drag area kosong atau
scroll untuk menggeser, Shift+scroll untuk geser horizontal, Ctrl+scroll untuk
zoom, dan Fit untuk menampilkan seluruh diagram. Koordinat negatif didukung;
ukuran canvas dari diagram lama tetap dapat diimport tetapi tidak membatasi
shape. Export SVG/PDF mengikuti batas konten diagram.
