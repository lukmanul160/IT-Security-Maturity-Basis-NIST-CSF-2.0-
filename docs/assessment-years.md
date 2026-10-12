# Assessment per tahun

Tombol **Hapus tahun** menghapus assessment tahun terpilih setelah pengguna mengetik tahun sebagai konfirmasi. Memerlukan izin Read dan Delete (ISO memerlukan keduanya pada ISO dan SOA). Tahun lain serta file evidence tetap tersimpan; referensi tahun yang dihapus dilepaskan. ISO dan SOA dihapus bersama, termasuk sasaran tahun tersebut. Assessment terakhir tidak dapat dihapus: buat tahun lain dahulu agar struktur tetap tersedia sebagai sumber New/Duplicate. Tahun 2026 juga dapat dihapus dan dibuat ulang dari tahun lain; tahun yang dihapus tidak muncul kembali saat startup.

API penghapusan: `DELETE /api/assessment-periods/:framework/:year`, sukses `204`, tahun tidak tersedia `404`, assessment terakhir `409`. API tanpa parameter tetap menunjuk 2026 dan mengembalikan `404` jika 2026 telah dihapus.

NIST CSF, Privacy, dan ISO 27001/SOA memiliki pemilih **Tahun assessment** serta tombol **+ New / Duplicate**. Pilih tahun tujuan dan tahun sumber. Setelah dibuat, halaman berpindah ke tahun baru; tahun terpilih bertahan setelah reload. ISO 27001 dan SOA memakai satu periode bersama.

- **New** menyalin struktur kontrol dari tahun sumber. Skor, catatan, gap, sasaran ISO, serta referensi evidence kosong; target maturity dimulai dari 3 dan applicability dari Applicable.
- **Duplicate** menyalin skor, target maturity, catatan, kontrol, applicability, gap, sasaran ISO dan referensi evidence. Gap mendapat UUID baru, sasaran ISO mengikuti tahun tujuan, dan sumber tetap tersimpan. File evidence dipakai bersama melalui referensi, bukan dibuat ulang.

Data assessment yang sudah ada tetap menggunakan penyimpanan awal dan terdaftar sebagai **2026**. Tahun baru disimpan terpisah di `assessment_periods`. Tahun yang sudah tersedia tidak dapat ditimpa melalui New/Duplicate. Rentang tahun 2000–2100.

Skor, gap, kontrol, target, evidence, sasaran ISO, reset, import, export dan laporan menggunakan tahun terpilih. Export mencantumkan `assessmentYear` dan tahun dalam nama file. Import diterapkan ke tahun tujuan yang sedang dipilih. Pengguna tetap membutuhkan izin Read/Create/Update/Delete yang sesuai; membuat periode ISO membutuhkan izin Create dan Read pada ISO serta SOA. Pergantian tahun menunggu request penyimpanan selesai dan ditolak ketika upload/form masih berjalan atau penyimpanan gagal.

API periode: `GET /api/assessment-periods/:framework` dan `POST /api/assessment-periods/:framework` dengan `{year:2027,sourceYear:2026,mode:"duplicate"}` atau `mode:"new"`. Framework periode: `csf`, `privacy`, `iso27001`. API assessment yang sudah ada menerima `?assessmentYear=2027`; tanpa parameter, API tetap menunjuk data awal 2026. Tahun yang belum dibuat mengembalikan 404.

Perubahan dalam satu periode memakai transaksi dan row lock agar perubahan kontrol dan gap bersamaan tidak saling menimpa. Indeks `assessment_period_files` melindungi evidence yang masih dirujuk tahun lain. Penghapusan file induk melepaskan referensi dari seluruh tahun dalam transaksi yang sama; pelepasan referensi di assessment hanya mengubah tahun terpilih. Backup PostgreSQL lengkap mencakup tabel periode dan referensinya.

Migration `database/assessment-periods.sql` dijalankan oleh provisioning dan startup; endpoint periode juga menyiapkannya secara idempotent. Tidak diperlukan pemindahan manual data assessment lama.

Validasi: `node --test test/assessmentPeriods.test.js`, `npm test`, `npm run build:client`, dan `npm run test:assessment-years-browser`. Tes API menggunakan schema PostgreSQL sementara; tes browser memakai fixture untuk seluruh penulisan assessment.
