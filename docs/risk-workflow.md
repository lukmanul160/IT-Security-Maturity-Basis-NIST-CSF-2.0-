# Risk Management workflow

Risk Register menyediakan tombol **Workflow** per risiko dan filter status. Dashboard menampilkan ringkasan alur. Treatment (Mitigation, Acceptance, Transfer, Avoidance) terpisah dari status. Closed hanya melalui approval closure; data lama bertreatment Closed tampil sebagai Legacy Closed dan tidak dianggap telah melalui persetujuan baru.

## Cara menggunakan

1. Pilih New risk. Draft cukup berisi Identification risk; skor yang kosong tetap belum dinilai.
2. Edit risk untuk melengkapi aset/proses, kategori, risk owner, skenario, penyebab, kontrol existing (tulis tidak ada bila memang belum ada), analisis, inherent likelihood dan impact. CIA adalah kritikalitas aset. Metode dampak skenario bisnis tersedia; metode CIA lama tetap dipertahankan untuk data lama.
3. Buka Workflow. Isi threat, vulnerability, alasan skor, current likelihood/impact, tolerance dan referensi kebijakan. Tentukan akun approver dan reviewer, kemudian simpan sebelum menjalankan **Selesaikan assessment**. Tolerance diisi per risiko dan ditinjau approver; aplikasi tidak menetapkan batas organisasi secara otomatis.
4. Pilih treatment lewat Edit risk. Untuk Mitigation/Transfer/Avoidance lengkapi rencana, PIC, deadline, target residual. Untuk Acceptance lengkapi justifikasi, kondisi, expiry, review date dan ID form Risk Acceptance yang pengesahannya sudah lengkap. ID 12 berarti RAF-00012. Draft/form acceptance bukan approval workflow.
5. Jalankan Ajukan approval dengan alasan keputusan. Approver yang ditunjuk login menggunakan akun ber-role admin atau approver serta izin update Risk Management. Pemohon tidak boleh menyetujui pengajuannya sendiri. Approver memilih Setujui atau Tolak. Penolakan kembali ke Assessed.
6. Setelah approval rencana, catat progress dan evidence berupa referensi dokumen/URL serta hasil tindakan. Progress 100 dan evidence diperlukan untuk Ajukan verifikasi. Reviewer login memakai akun yang ditunjuk, berbeda dari akun pelaksana yang mengajukan verifikasi. Isi residual aktual melalui Edit risk saat Pending Verification, lalu catat hasil pemeriksaan dan review date di Workflow. Perubahan residual pada tahap ini mempertahankan antrean verifikasi.
7. Verifikasi residual masuk Monitoring bila skor aktual dalam tolerance. Jika masih di atas tolerance, kembali ke Assessed untuk treatment lanjutan atau exception Acceptance. Target residual tidak membuktikan efektivitas kontrol; keputusan verifikasi dicatat terpisah.
8. Approval Acceptance masuk Accepted dengan masa berlaku eksplisit. Saat expiry tercapai, form berubah/dihapus/ditolak, atau assessment tidak cocok dengan snapshot, status efektif menjadi Review Required. Acceptance tersebut tidak dihitung aktif. Tidak ada perpanjangan otomatis. Review jatuh tempo ditandai terpisah dan muncul pada notifikasi dashboard.
9. Untuk monitoring berkala, isi evidence dan tanggal review berikutnya lalu Catat review. Insiden, perubahan material, atau expiry memerlukan Assessment ulang. Closure memerlukan alasan sumber risiko dihilangkan/tidak lagi relevan, evidence, pengajuan, dan approval dari akun yang berbeda. Treatment selesai tidak otomatis Closed.

## Data dan kontrol

- Tabel `risk_workflows` menyimpan data terstruktur dan version; `risk_workflow_events` menyimpan aktor, aksi, alasan, waktu, snapshot workflow dan assessment. Histori bisa dilihat dalam dialog. Histori bukan klaim penyimpanan tamper-proof; hapus/reset register mengikuti izin yang ada dan menghapus histori terkait.
- Perubahan material pada register atau field assessment/rencana workflow mengembalikan status ke Draft dan membatalkan approval/verifikasi sebelumnya. Catatan/comment biasa tidak membatalkan approval. Editing Closed melalui workflow dimulai dengan Assessment ulang.
- Server memeriksa persyaratan tahap, akun approver/reviewer, alasan keputusan, tanggal kalender, skor, versi data, dan snapshot form acceptance. Transaksi mengunci baris risk register sehingga CRUD dan keputusan workflow tidak saling melewati.
- Semua mutasi memerlukan izin update Risk Management; baca memerlukan read. Keputusan approval juga memerlukan role admin/approver dan akun yang ditunjuk. Pemilihan akun tidak memberi permission baru.
- Evidence menggunakan referensi teks ke dokumen yang tersedia; fitur ini belum mengunggah atau memverifikasi isi berkas. Reviewer bertanggung jawab mengecek referensinya.
- JSON Risk Register menyertakan data workflow saat export. Import register tidak memulihkan approval/histori sebagai keputusan baru; backup database tetap digunakan untuk pemulihan seluruh workflow. Laporan dashboard Excel/PDF menyertakan status, current/target dan status verifikasi.
- Reminder berupa indikator saat data dimuat/refreshed; tidak mengirim email atau pesan keluar. Semua batas tanggal menggunakan Asia/Bangkok.

## API

- `GET /api/risk-management/workflow-users`
- `GET /api/risk-management/:id/workflow`
- `PUT /api/risk-management/:id/workflow`: data workflow yang diizinkan dan `version`.
- `POST /api/risk-management/:id/workflow/transition`: `action`, `reason`, `version`.

Aksi: assess, submit, approve, reject, complete, verify, reassess, review, requestClosure, close. Field status/approvedBy dari client tidak dapat menggantikan keputusan server. HTTP 409 menandai versi lama atau tahap yang tidak sesuai; refresh sebelum mencoba lagi.

Inisialisasi tabel dan kolom berjalan melalui `riskManagementService.ensureStore()` saat server startup. Build frontend dengan `npm.cmd run build:client` pada PowerShell. Restart backend diperlukan untuk memuat kode server yang baru.

Validasi: `node --test test/riskWorkflow.test.js`, `npm.cmd test`, `npm.cmd run test:risk-workflow-browser`. Browser/API test menggunakan schema terisolasi dan membersihkannya setelah selesai, termasuk akun, register, form acceptance, permission dan audit event fixture.

## Alur antarmuka yang dipandu

Halaman Risk Management menyediakan panduan empat tahap dan akses langsung
Tambah risiko / Lanjutkan risiko terdaftar. Tab adalah navigasi Dashboard,
Risk Register, dan Pengelolaan Pilihan, bukan tahap approval.
Form register dimulai dengan identifikasi, lalu penilaian. Rencana treatment sebaiknya dilengkapi sebelum Selesaikan assessment; perubahan
material setelahnya dapat mengembalikan status ke Draft sesuai aturan yang ada.
Rencana treatment dan hasil tindakan dipisah menjadi bagian yang dapat dibuka sesuai kebutuhan.
Simpan draft menyimpan tanpa menjalankan keputusan; Simpan & lanjutkan menyimpan
lalu membuka Alur risiko setelah daftar berhasil dimuat ulang. Pesan sukses
menyediakan tautan kembali ke alur risiko yang baru disimpan.

Pada register, tampilan Ringkas menampilkan ID/status, deskripsi, owner, rating,
treatment, deadline, serta arahan langkah berikutnya. Pilih Lengkap untuk semua
kolom. Filter, sort, pagination, dan cakupan laporan tetap berlaku pada daftar.
Lanjutkan alur membuka keputusan; Data risiko membuka identifikasi/skor/rencana.
Dialog alur menampilkan panduan sesuai effectiveStage dan checklist isian kosong.
Checklist membantu pengisian; validasi skor, tanggal, otorisasi, dan pengesahan
form acceptance tetap diperiksa server saat keputusan dijalankan.
Bagian workflow yang relevan terbuka sesuai tahap, bagian lain tetap dapat dibuka.
Tombol Edit Data risiko dari alur kembali ke risiko yang sama setelah simpan atau
batal. Histori dapat dibuka sesuai kebutuhan. Reset register ditempatkan dalam
Administrasi register pada tab Pengelolaan Pilihan.

Verifikasi: `node --test test/riskManagementGuidance.test.js test/riskWorkflow.test.js`
lulus 11 test fixture/logika. Build frontend serta kelengkapan/keunikan ID DOM
diperiksa. Browser nyata dan PostgreSQL nyata belum diuji untuk perubahan UI ini.
Tidak ada data operasional atau aturan keputusan backend yang diubah.

Risk treatment description memakai label di atas dan textarea selebar bagian
form, tujuh baris dengan tinggi minimal 170px; tinggi dapat diperbesar dengan
drag. Verifikasi perubahan ukuran melalui build, belum melalui browser nyata.

Next Moves / Langkah berikutnya menampilkan daftar field kosong atau tidak valid
beserta alasan dan lokasi. Klik item untuk membuka bagian terkait, scroll, dan
fokus ke input. Isian diberi garis amber, pesan inline, serta aria-invalid dan
aria-describedby; tidak mengandalkan warna saja. Field Data risiko membuka editor
risiko yang sama dan kembali ke workflow setelah simpan/batal. Perubahan workflow
yang belum disimpan harus disimpan sebelum berpindah editor agar tidak hilang.
Checklist diperbarui dari input saat mengetik/memilih, termasuk skor 1-5, tolerance
1-25, progress 100%, tanggal deadline/review/expiry yang relevan, dan alasan
keputusan. Jika isian yang diperiksa lengkap, panduan menyebut tombol keputusan
yang perlu dipilih atau meminta Simpan data workflow jika masih ada perubahan.
Server tetap memeriksa pengesahan form, otorisasi, dan persyaratan akhir.
Verifikasi memakai fixture DOM/logika dan build; browser serta PostgreSQL nyata
belum diuji langsung untuk highlight dan navigasi field ini.

Feedback keputusan workflow ditampilkan di dekat tombol melalui rwActionStatus,
selain status bagian atas dialog. Klik yang tertahan oleh perubahan belum
disimpan, alasan kosong, atau isian assessment/rencana belum lengkap menampilkan
penyebab tanpa mengirim keputusan. Saat request berjalan ditampilkan status
memproses dan tombol dikunci; hasil berhasil menyebut status baru. Error API
ditampilkan di area yang sama, termasuk requestId jika tersedia. Tombol keputusan
memakai event delegation langsung pada rwActions. Kegagalan refresh setelah
keputusan sukses dibedakan dari kegagalan penyimpanan.

Verifikasi tambahan: `npm run test:risk-workflow-ui-fixture` memakai Chrome nyata,
HTML/form dan runtime workflow aktual, dengan transport API fixture. Skenario:
klik tanpa alasan, submit berhasil dengan progress status dan payload submit,
perubahan belum disimpan, serta API menolak pengajuan. Tidak membaca .env atau
mengakses PostgreSQL; belum merupakan uji pengajuan terhadap database nyata.
