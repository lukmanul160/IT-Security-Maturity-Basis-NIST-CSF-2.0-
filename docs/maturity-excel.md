# Export dan import Excel maturity

Gunakan **Export Excel** atau **Import Excel** pada halaman assessment/core NIST CSF 2.0 atau Privacy. Pilih tahun assessment terlebih dahulu. Export memakai salinan template `NIST-CSF2.0-Maturity-Tool-v1.0.3 (1).xlsx` di `data/maturity-template.xlsx`; struktur tujuh sheet, style, lebar kolom, merge, gambar, dan grafik dipertahankan. Hanya sheet framework yang dipilih diisi. Nilai demonstrasi pada sheet lainnya dikosongkan agar tidak dianggap sebagai hasil assessment.

| Nilai sistem | CSF 2.0 | Privacy Framework Core |
| --- | --- | --- |
| `policyScores[id]` | G: Policy Maturity | L: Policy Score |
| `notes['policy-'+id]` | H: Policy Score Reasoning | M: Policy Score Reasoning |
| `practiceScores[id]` | I: Practice Maturity | N: Practice Score |
| `notes['practice-'+id]` | J: Practice Score Reasoning | O: Practice Score Reasoning |

CSF mendukung fallback skor practice lama dari `scores[id]`. Sel kosong tetap kosong, termasuk kontrol yang belum dinilai. Skor 0 dipertahankan. Reasoning mendukung beberapa baris dan tidak digabungkan antara policy dan practice. Formula summary dan cache grafik mengambil skor hasil export; kontrol/kategori tambahan ikut summary. Excel diminta menghitung ulang formula saat workbook dibuka. Format tampilan Excel mengikuti template, terlepas dari tema aplikasi.

Untuk menambahkan kontrol, isi satu baris baru:

- **CSF:** A = Function, B = Category, C = `kode: uraian`, D = Implementation Examples, F = Informative References, G–J = empat kolom penilaian.
- **Privacy:** B = Function, D = Category, F = `kode: uraian`, L–O = empat kolom penilaian.

Contoh kode: `GV.NEW-01: Pengelolaan risiko tambahan` atau `ID.NEW-P1: Inventaris tambahan`. Kode CSF `GV.OC-01` dipetakan ke ID sistem `GV-OC-01`; kode Privacy dipertahankan. Function dan Category dapat diwarisi dari heading/sel merge sebelumnya, seperti pada template asli. Untuk kategori atau function baru, tulis nilainya secara eksplisit. Jangan mengubah nama sheet atau header maturity/reasoning. Tambahkan baris dengan menyalin format baris kontrol, bukan baris judul.

Import menampilkan pratinjau jumlah kontrol baru/perbaruan. Kode yang sama memperbarui metadata dan empat kolom penilaian; kode baru menambahkan kontrol. Category baru tersedia melalui data kontrol dan memperoleh target awal 3. Kolom maturity kosong menghapus skor pada kontrol tersebut. Kontrol yang tidak ada dalam file, lampiran/evidence, catatan kontrol, dan gap tetap disimpan. Template asli memuat seluruh kontrol standar; kontrol standar yang belum ada di sistem juga dihitung sebagai tambahan saat diimport. Tidak ada penghapusan kontrol secara implisit.

File wajib XLSX, maksimal 10 MB dan 5.000 kontrol. Kode duplikat, skor di luar 0–5, formula pada sel maturity, header salah, dan struktur tidak lengkap ditolak sebelum penyimpanan. Import memerlukan izin Read/Edit assessment, Read kontrol, Add untuk kode baru, dan Edit untuk kontrol yang sudah ada. Penyimpanan kontrol dan assessment memakai satu transaksi sehingga gagal seluruhnya jika salah satu penyimpanan gagal. Tahun lain dan framework lain tidak ikut berubah.

API: `GET /api/maturity-workbook/csf?assessmentYear=2026` atau `privacy`; `POST` memakai multipart `file`, dan `POST .../preview` membaca pratinjau tanpa menyimpan.

Validasi: `npm.cmd run test:maturity-excel`, `npm.cmd run test:maturity-excel-browser`, `npm.cmd run test:i18n`, dan `npm.cmd run build:client`. Script `node scripts/export-maturity-workbooks.js 2026` membuat kedua workbook dari nilai tersimpan di direktori `output`, lalu membandingkan setiap skor dan reasoning dengan sumbernya.
