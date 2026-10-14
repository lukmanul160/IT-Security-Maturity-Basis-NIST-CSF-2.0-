# Perbaikan LCP — 14 Oktober 2026

Perbaikan dilakukan pada website yang sudah ada, termasuk beranda, halaman masuk, dan workspace.

## Perubahan

- JavaScript awal workspace dipisah dari runtime fitur. Bundle awal turun dari sekitar 1,32 MB / 315 KB gzip menjadi 624 KB / 149 KB gzip. Runtime mulai diunduh saat bootstrap dimulai, tetapi setup fiturnya menunggu kesempatan paint tampilan awal. Total kode fitur tidak dihapus; sebagian dipindahkan dari jalur kritis.
- Enam stylesheet workspace digabung ke satu stylesheet Vite dengan nama file hash. Urutan stylesheet legacy, Tailwind, dan tema dipertahankan.
- DM Sans dan Space Grotesk disediakan sebagai WOFF2 dari origin aplikasi, beserta lisensi OFL. Import stylesheet Google Fonts dihapus. `font-display: optional` menghindari swap font terlambat pada jaringan lambat; kunjungan awal dapat memakai fallback jika font belum tersedia. Font utama dipreload dan font hash dicache immutable.
- Editor catatan baru diunduh ketika halaman Knowledge Notes dibuka atau dipulihkan dari navigasi tersimpan. Bootstrap dashboard tidak lagi memuat bundle editor sekitar 551 KB / 177 KB gzip.
- HTML beranda, login, workspace, dan kantor virtual dikompresi. API, dokumen unduhan, serta gambar tidak ikut perubahan filter kompresi ini.
- Preferensi tema diterapkan dengan initializer kecil sebelum paint; script kontrol tema dimuat defer. Animasi masuk pada teks utama beranda dan panel login dihapus.
- Layar loading workspace dilepas setelah UI Vue terpasang. Workspace ditandai busy/inert sementara listener fitur disiapkan, lalu dibuka saat ready. Jika bootstrap gagal, tampilan error memulihkan interaksi tombol reload.
- Format tanggal tidak menulis DOM ketika hasilnya sama. Branding memakai hasil terjemahan yang sama untuk tagline dan mengecualikannya dari translasi DOM berikutnya, sehingga pengaturan branding dan penerjemah tidak menulis bergantian.

## Pengukuran

Chrome headless pada Windows, viewport 1440×1000, cache browser dimatikan, CPU slowdown 4×, latency 150 ms, download 200.000 byte/detik. Halaman memakai aplikasi dan database lokal; record bisnis tidak diedit.

| Halaman | LCP sebelum | LCP setelah |
| --- | ---: | ---: |
| Beranda | 4,12 detik | 3,48 detik |
| Masuk | 3,43 detik | 1,34 detik |
| Workspace | 8,68 detik | 5,28 detik |

Angka sebelum adalah rata-rata dua sampel; angka setelah adalah satu sampel akhir yang berhasil, sehingga ini bukan perbandingan statistik yang kuat atau hasil P75 pengguna nyata. Beberapa percobaan antara mengalami timeout debugger dan tidak dipakai sebagai pengukuran akhir. LCP beranda juga menangkap area teks yang berbeda setelah animasi masuk dihapus, meski elemen H1 dan isi tetap sama. Semua halaman pada percobaan akhir melukis konten, workspace mencapai status ready, dan tidak ada exception browser yang tercatat.

Bukti mentah: `output/lcp-before-2026-10-14.json` dan `output/lcp-after-2026-10-14.json`. Pengukuran dapat diulang dengan `node scripts/measure-lcp-browser.js current`; `LCP_SAMPLES` mengatur jumlah sampel per halaman (default dua).

Workspace dan beranda masih di atas target umum LCP 2,5 detik pada profil lab ini. Perbaikan berikutnya memerlukan pengurangan DOM komponen awal, modularisasi fitur legacy lebih jauh, dan pengukuran TTFB/database pada VM produksi. Pengukuran lokal tidak menjamin angka yang sama pada koneksi, perangkat, proxy, atau volume data lain. Uji ulang PageSpeed/DevTools pada deployment sesudah rebuild.

## Validasi dan penerapan

Suite aplikasi: 321 lulus, 5 dilewati, 0 gagal. Tes bahasa 11 lulus, termasuk tanggal yang stabil dan tagline dua bahasa. Tes terarah catatan/tema/cache/asset 17 lulus. Build frontend, browser dashboard, dan browser tampilan error lulus. Regresi browser Knowledge Notes lulus untuk editor, graf, penyimpanan, reload, import file/folder beserta gambar, dan pengelolaan lampiran. Halaman khusus pengujian diperbaiki agar mengaktifkan layanan progres unggahan; pemeriksaan reload menunggu halaman baru selesai dimuat.

Docker sudah menyalin seluruh `frontend/public` dari build, sehingga font dan bundle baru ikut image. Jalankan `docker compose --env-file .env.docker up -d --build app`, lalu Ctrl+F5. Backend perlu versi terbaru agar endpoint font dan kompresi HTML tersedia.

Acuan: [Google web.dev — Optimize LCP](https://web.dev/articles/optimize-lcp), mengenai pengurangan hambatan pemuatan dan render konten utama. Hasil di atas merupakan pengukuran lokal, bukan angka dari sumber tersebut.
