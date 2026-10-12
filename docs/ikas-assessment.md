# IKAS BSSN v1.2.1

Sumber modul adalah IKAS v.1.2.1.xlsx: 181 pertanyaan, 18 kategori, 90 subkategori, empat domain, rubrik indeks 0–5 dan 15 field responden. Seed dan salinan Excel disimpan dalam data/ikas-data.json dan data/ikas-template.xlsx.

Setiap pertanyaan memiliki satu Indeks Nilai Kematangan dan satu Keterangan. Nilai 0 valid; pilihan kosong berarti belum dinilai. Perhitungan mengikuti rata-rata subkategori, kategori dan domain; bobot domain 25%, 30%, 25%, 20%; pembulatan ke bawah dua desimal. Not applicable dikecualikan. Nilai akhir tersedia setelah seluruh pertanyaan yang berlaku terisi.

Overview, Assessment Core, Data Responden, Manage, input, dropdown dan dialog memakai gaya form workspace yang konsisten, dengan border, padding, focus, mode gelap dan layout responsif. Pilihan jenis sistem, sektor dan target level berasal dari Excel. Ikon sidebar menggunakan SVG shield dan pengelolaan kontrol.

Autosave, pencarian/filter, pagination, rubrik, dokumen bukti, gap, Manage, New/Duplicate dan hapus tahun tetap tersedia. Catatan dan referensi evidence lama digabungkan ke satu penilaian, dengan deduplikasi file. Indeks yang sudah tersimpan dipertahankan. Assessment terakhir tidak dapat dihapus.

Export JSON memuat kontrol/rubrik, satu indeks, keterangan, responden, target, evidence dan gap. Export Excel memakai paket workbook asli dan hanya mengisi kolom Indeks Nilai Kematangan serta Keterangan Validasi pada empat domain. Sheet, format, gambar, rumus, validasi dropdown, Responden, dan Rekap tetap mengikuti template; tidak ada sheet tambahan. Workbook lengkap yang diimport disimpan sebagai template tahun tersebut dan ikut pada New/Duplicate. Import menampilkan pilihan domain dan jumlah pertanyaan baru/dihapus. Hanya domain terpilih diperbarui secara atomik; domain lain serta file evidence tetap tersimpan. Pemetaan memakai identitas subkategori dan huruf pertanyaan, dengan posisi kolom dibaca dari header Excel, sehingga tambahan pertanyaan atau perpindahan baris didukung. Untuk perubahan struktur lengkap, gunakan workbook lengkap versi terbaru agar export memakai format yang sama. Laporan HTML dapat dicetak sebagai PDF.

API: /api/ikas, /api/ikas/assessment, /api/frameworks/ikas/targets, /api/assessment-gaps/ikas, /api/assessment-periods/ikas, /api/ikas-workbook dan /api/ikas-template. Parameter assessmentYear menentukan tahun; default 2026. Izin IKAS BSSN mengatur kontrol; izin IKAS BSSN assessment mengatur penilaian. Izin Files dan kepemilikan file tetap berlaku.

Validasi: npm run test:ikas, npm run test:ikas-browser, npm test, npm run build:client. Tes API memakai schema sementara; tes browser memakai fixture untuk seluruh penulisan assessment.

Tampilan Overview memakai hero-grid dengan maturity, completion, priority gaps, function-cards, summary-table dan radar-panel seperti CSF 2.0. IKAS Core memakai excel-table dengan satu Indeks Nilai Kematangan dan Keterangan Validasi; assessment per domain tetap tersedia.
