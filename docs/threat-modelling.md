# Threat Modelling

Sidebar **Threat Modelling** membuka editor diagram data flow dengan panel
Shapes, kanvas SVG bergaris bantu, toolbar, dan Properties. Komponen yang
tersedia: external entity, process, service/API, data store, trust boundary,
dan note. Klik atau drag dari palette, geser komponen pada kanvas, dan gunakan
handle sudut kanan bawah untuk resize. Posisi mengikuti grid 20 px. Connect
membuat panah dari komponen sumber ke komponen tujuan; label panah dapat diedit.

Properties menyimpan label, deskripsi, warna, posisi, ukuran, serta daftar
ancaman STRIDE per komponen atau aliran data. Setiap ancaman memuat kategori,
severity, status, dan mitigasi. Threat register merangkum seluruh ancaman.
Example diagram menyediakan contoh aplikasi web yang dapat disesuaikan.

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
