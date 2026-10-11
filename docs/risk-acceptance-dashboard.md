# Risk Acceptance Dashboard

Dashboard membaca `risk_acceptance_forms` dan mempertahankan formulir serta PDF yang sudah tersedia. Tidak ada perubahan skema data pengajuan.

## Status dan akuntabilitas

- Rejected: keputusan Business Owner atau CIS adalah `denied`.
- Pending: keputusan belum valid untuk penerimaan, atau salah satu tahap pengesahan pemohon, CIO, CIS belum lengkap. Kelengkapan menggunakan nama, input tanda tangan, dan tanggal yang valid. Nama pemohon menggunakan print name jika tersedia, atau name of requestor.
- Approved / Approved with conditions: keputusan menerima serta seluruh input pengesahan lengkap. Ini adalah status turunan dashboard; nilai keputusan asli pada formulir tidak berubah.
- Tanda tangan pada form merupakan teks yang diinput pengguna. Dashboard tidak memverifikasi identitas, kewenangan approver, atau signature kriptografis.

Default CIS `approved` pada form kosong tidak otomatis dihitung sebagai pengajuan disetujui karena pengesahan belum lengkap.

## Jadwal review

Kalender, countdown, dan pengingat menggunakan `remediationDate` (“Risk will be remediated by”), dalam kalender Asia/Bangkok. Field ini bukan expiry approval. Pilihan `one_year` tidak digunakan untuk mengarang tanggal expiry.

Active accepted requests: Approved/Conditional dengan tanggal remediasi hari ini atau setelahnya. Pengajuan tanpa tanggal ditampilkan pada KPI tersendiri, bukan dihitung aktif tanpa batas. Review within 30 days mencakup H-30 sampai hari ini; overdue berarti tanggal remediasi sebelum hari ini.

Kalender menyertakan pengajuan tidak ditolak yang memiliki tanggal remediasi, termasuk yang masih Pending. Pengingat lokal khusus pengajuan disetujui menggunakan bucket H-30, H-14, H-7 dan overdue, tanpa mengirim email atau pesan keluar.

## Navigasi dan aksi

- Filter status, aset, departemen, dan jadwal berlaku untuk KPI, visual, kalender, dan daftar dashboard.
- KPI, distribusi aset/departemen, tanggal kalender, dan indikator pengesahan mendukung drill-down ke tabel.
- Pencarian serta drill-down berlaku pada tabel, tanpa mengubah ringkasan global. Kalender dapat memilih bulan lain.
- ID tampilan `RAF-00001` mengikuti ID database; bukan nomor dokumen tambahan yang disimpan.
- Detail menggunakan modal read-only yang sudah ada. Edit/review menggunakan form yang sama dan izin `risk-acceptance/update`.
- Tombol Request Risk Acceptance tersedia dari dashboard dan tab list. Guard penyimpanan tetap mencegah submit ganda; pemeriksaan tombol yang sebelumnya menghalangi submit yang sudah dikunci guard diperbaiki.
- PDF form menggunakan endpoint existing; bukan sertifikat signature digital.
- Audit log per pengajuan hanya untuk Admin, sama dengan kebijakan Audit Trail aplikasi. Endpoint mengambil aktivitas path pengajuan/PDF dan aktivitas create yang response ID-nya cocok. Log berisi waktu, pengguna, IP, request ID, status HTTP, dan detail aktivitas. Tidak mengklaim log tamper-proof.

## Data yang belum tersedia

Level/skor risiko, estimasi finansial, mapping standar terstruktur, asset type, tanggal expiry approval, status Revoked, dan hubungan ke threat intelligence belum tersimpan pada formulir. Kontrol/rencana mitigasi memakai `mitigationPlan`; compliance deviation memakai deskripsi bebas, bukan klasifikasi regulasi otomatis.

Routing approver berdasarkan level risiko, Extend/Revoke sebagai workflow khusus, attachment evidence, notifikasi email/Slack/Teams, dan auto-revocation membutuhkan perluasan model data dan backend. Dashboard menampilkan ketersediaan data tanpa membuat tombol yang mengklaim aksi tersebut sudah didukung.

Data dimuat saat startup, setelah perubahan form, atau melalui Refresh data. Filter dan kalender dashboard tidak mengubah data pengajuan.

Validasi: `npm run build:client`, `npm test`, `npm run test:risk-acceptance-dashboard-browser`. Browser test memakai schema dan sequence ID terpisah dari data produksi dan menghapusnya setelah selesai.

Daftar pengajuan hanya ditampilkan pada tab **List Risk Acceptance**. Klik KPI, departemen, aset, kalender, atau tahap pengesahan membuka tab tersebut dengan drill-down sesuai pilihan. Pencarian dan pagination menggunakan hasil filter yang sama; tombol Reset semua filter menghapus filter dashboard, pencarian, dan drill-down. Detail, edit, PDF, audit Admin, dan hapus sesuai hak akses tersedia pada daftar yang sama.
