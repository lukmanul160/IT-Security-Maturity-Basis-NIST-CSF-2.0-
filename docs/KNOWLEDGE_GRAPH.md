# Memori proyek untuk sesi AI

Tujuan: memilih konteks kecil sesuai tugas, tanpa membaca ulang seluruh proyek.
Graph lokal tersimpan di `docs/knowledge-graph.json`. Tidak memerlukan server,
database graph, API, embedding, atau paket tambahan. Jangan masukkan JSON lengkap
ke prompt; gunakan query yang hasilnya dibatasi.

## Urutan sesi baru

1. Baca AGENTS.md, lalu `git status --short` untuk melindungi perubahan pengguna.
2. Baca bagian Memori proyek untuk AI pada README dan panduan singkat ini.
3. Jalankan `npm run knowledge:query -- technology` atau topik/nama fungsi lain.
   Beberapa kata memakai AND; gunakan nama teknis/path bila istilah Indonesia
   tidak menghasilkan kecocokan. Pencarian literal, bukan pencarian semantik.
4. Baca dokumen dan sumber hasil query yang relevan. Cari bagian handoff dengan
   `rg -n -i "technology|scan" docs/AI_HANDOFF.md`, lalu baca bagian tersebut.
5. Ikuti dependency/README lokal untuk perubahan. Validasi kontrak pada kode aktual.
6. Sesudah edit, `npm run knowledge:build` lalu `npm run knowledge:check`.

Contoh prompt sesi berikutnya:

> Ikuti AGENTS.md. Gunakan knowledge:query untuk konteks tugas ini, baca bagian
> handoff dan sumber yang relevan saja. Tugas: perbaiki pencarian Technology Asset.

## Isi dan asal relasi

- Node file sumber JS/MJS/Vue berasal dari scanner katalog AST yang sudah ada.
  Nama fungsi dan nomor baris membantu membaca bagian kecil sumber.
- `imports`: import/require relatif statis yang berhasil diresolve ke node.
- `documented-by`: README terdekat dalam folder induk.
- `references`: tautan Markdown lokal yang menunjuk node terindeks.
- `assembles` dan `runtime-before`: manifest urutan runtime classic-script.
- Dokumentasi Markdown di docs, schema SQL di database, test dan script juga
  terindeks. Kehadiran test bukan bukti cakupan atau kelulusannya.

Query menampilkan maksimal 12 file, 6 simbol dan 8 relasi per file. Graph JSON
menyimpan seluruh relasi terdeteksi untuk tooling. File aplikasi tidak dieksekusi.
Scanner tidak membaca `.env`, data, upload, backup, node_modules atau aset build.
Hash SHA-256 seluruh input terindeks mendeteksi perubahan, penambahan dan penghapusan;
CRLF/LF dinormalisasi. Build deterministik dan tidak mengambil timestamp sesi.
Check/query membaca input untuk hash, tetapi hanya hasil kecil dikirim ke konteks AI.

## Batas dan verifikasi

Graph ini indeks navigasi statis, bukan call graph lengkap atau sumber kebenaran
bisnis. Tidak menyimpulkan hubungan UI-route-service, SQL, permission, dynamic import,
atau dependency implisit shared scope. Telusuri alur terkait pada kode sebelum edit.
Dokumen historis dapat saling menggantikan; baca bagian terbaru yang relevan.
Perubahan file di luar cakupan tidak dilacak oleh hash. Regenerasi setelah mengganti
dependency/tooling; graph tidak menyimpan isi lockfile atau konfigurasi deployment.

Tidak menjamin AI eksternal otomatis mengikuti panduan atau mengingat sesi sebelumnya.
Penghematan token berasal dari pembacaan selektif; belum ada benchmark token.
Tidak ada perubahan perilaku aplikasi, schema atau frontend sehingga build frontend
tidak diperlukan. Verifikasi graph tidak membuktikan runtime, Docker atau cloud.
