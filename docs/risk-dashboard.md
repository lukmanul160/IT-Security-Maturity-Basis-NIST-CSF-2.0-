# Risk Register Dashboard

Dashboard menggunakan data dan otorisasi Risk Register yang tersedia, tanpa mengubah skema atau menambahkan data contoh ke register produksi.

- Filter cakupan mengikuti `effectedAsset` / `deviceName`; kategori dan owner diambil dari nilai register. Departemen, proyek, dan portofolio belum disimpan pada register.
- Filter periode menggunakan `createdAt` dengan kalender Asia/Bangkok: bulan berjalan, kuartal berjalan, YTD, atau rentang tanggal inklusif. Semua waktu mencakup risiko tanpa tanggal pendaftaran; filter periode membutuhkan tanggal yang valid.
- Risiko aktif berarti treatment bukan `Closed`. Overdue berarti aktif dan deadline sebelum hari ini. Rating mengikuti matriks aplikasi: Low 1–4, Medium 5–12, High 15–25; tidak menambahkan klasifikasi Critical.
- Exposure adalah jumlah skor likelihood × impact, bukan Rupiah/USD. Residual yang belum lengkap tetap ditampilkan sebagai belum dinilai, bukan Low.
- Net change adalah rata-rata selisih residual minus inherent pada risiko dengan kedua penilaian lengkap. Histori skor periode sebelumnya belum tersedia.
- Heatmap, KPI, grafik kategori, owner, indikator, dan bulan pendaftaran membuka tab Risk Register dengan drill-down yang sesuai. Titik grafik tren dapat diklik atau diaktifkan dengan Enter/Space. Dashboard tidak memiliki tabel risiko duplikat. Filter global berlaku untuk semua visual; pencarian, filter register, dan drill-down berlaku pada satu tabel Risk Register serta laporan. Klik drill-down membersihkan filter lokal yang lama agar daftar cocok dengan angka dashboard. Banner di register menjelaskan filter dashboard yang aktif, menyediakan Hapus drill-down, dan Kembali ke dashboard. Clear filters pada register menghapus semua filter global/lokal serta drill-down.
- Grafik tren menunjukkan risiko dengan rating High saat ini menurut bulan pendaftaran. Grafik ini bukan snapshot histori rating per bulan.
- Indikator menampilkan rasio High aktif, overdue, dan residual High aktif. KRI downtime, turnover, dan budget variance membutuhkan data pengukuran tambahan.
- Target score dan progres mitigasi numerik belum disimpan. Treatment tetap menggunakan pilihan yang tersedia, dengan perubahan melalui Quick edit.
- Notifikasi menunjukkan overdue dan residual High aktif pada cakupan filter. Ini bukan sistem push notifikasi atau histori eskalasi skor.
- Detail menampilkan komentar, catatan, tanggal dibuat/diperbarui. Komentar diperbarui melalui form register; log aktivitas mengikuti Audit Trail aplikasi. Komentar threaded, histori skor per risiko, dan sinkronisasi push antar pengguna belum tersedia.
- Quick edit mengikuti izin `risk-management/update`; laporan mengikuti `risk-management/read`. Otorisasi berbasis owner tidak ditambahkan di atas izin aplikasi yang ada.
- Export Excel, PDF, dan JSON dashboard serta Export data pada register menggunakan risiko dalam tabel hasil filter. PDF/Excel mengambil kembali data resmi dari server berdasarkan ID yang dipilih. Format PowerPoint belum didukung. PDF memakai font standar dan mengganti karakter di luar ASCII yang tidak didukung font dengan `?`; Excel/JSON mempertahankan teks Unicode.

Data dimuat saat membuka modul, setelah penyimpanan, atau melalui Refresh data. Perubahan dari pengguna lain terlihat setelah refresh.

Validasi: `npm run build:client`, `npm test`, `npm run test:risk-dashboard-browser`. Browser test memakai tabel pada schema terpisah dan menghapus schema tersebut setelah selesai.
