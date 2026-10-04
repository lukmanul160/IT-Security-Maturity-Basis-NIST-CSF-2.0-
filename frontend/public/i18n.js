/* Shared, offline Indonesian / English UI localization for public pages and Vue. */
(function (global) {
  'use strict';
  const pairs = [
    ['Belum ada data.', 'No data available.'], ['Preferensi Komunikasi', 'Communication Preferences'], ['Kesadaran Pemrosesan Data', 'Data Processing Awareness'],
    ['Manajemen Risiko Ekosistem Pemrosesan Data', 'Data Processing Ecosystem Risk Management'], ['Partisipasi Subjek Data', 'Data Subject Participation'], ['Kebijakan Tata Kelola', 'Governance Policies'],
    ['Misi organisasi dipahami dan menjadi dasar manajemen risiko keamanan siber', 'The organizational mission is understood and informs cybersecurity risk management'],
    ['Pemangku kepentingan internal dan eksternal dipahami, serta kebutuhan dan harapan mereka terkait manajemen risiko keamanan siber dipahami dan dipertimbangkan', 'Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered'],
    ['Persyaratan hukum, regulasi, dan kontrak terkait keamanan siber, termasuk kewajiban privasi dan kebebasan sipil, dipahami dan dikelola', 'Legal, regulatory, and contractual requirements regarding cybersecurity - including privacy and civil liberties obligations - are understood and managed'],
    ['Ikhtisar CSF', 'CSF overview'], ['Ikhtisar privasi', 'Privacy overview'], ['Gambaran kematangan', 'Maturity Snapshot'], ['Pusat Kontrol CSF 2.0', 'CSF 2.0 Control Room'],
    ['Ikhtisar dan penilaian NIST Cybersecurity Framework 2.0 dalam satu halaman.', 'NIST Cybersecurity Framework 2.0 overview and assessment on one page.'],
    ['Mulai penilaian', 'Start assessment'], ['Atur ulang penilaian CSF', 'Reset CSF assessment'], ['Atur ulang penilaian privasi', 'Reset Privacy assessment'],
    ['Kematangan keseluruhan', 'Overall maturity'], ['Kematangan privasi keseluruhan', 'Overall privacy maturity'], ['Belum dinilai', 'Not assessed'], ['Penyelesaian', 'Completion'],
    ['Kesenjangan prioritas', 'Priority gaps'], ['kontrol di bawah target tingkat 3', 'controls below target level 3'], ['Cakupan kerangka kerja', 'Framework Coverage'],
    ['Target kematangan', 'Target maturity'], ['Ringkasan NIST CSF', 'NIST CSF Summary'], ['Ringkasan privasi', 'Privacy Summary'], ['Kematangan kategori', 'Category maturity'],
    ['Rata-rata kebijakan dan praktik per kategori', 'Policy and Practice average by Category'], ['Jumlah kontrol', '# Controls'], ['Skor target', 'Target Score'],
    ['Skor kebijakan', 'Policy Score'], ['Skor praktik', 'Practice Score'], ['Kematangan kebijakan', 'Policy Maturity'], ['Kematangan praktik', 'Practice Maturity'],
    ['Profil kematangan kategori', 'Category Maturity Profile'], ['Kebijakan dan praktik per kategori', 'Policy and practice by category'],
    ['Rata-rata subkategori · Skala 0 hingga 4', 'Average of subcategories Â· Scale 0 to 4'], ['Rata-rata subkategori · Skala 1 hingga 5', 'Average of subcategories Â· Scale 1 to 5'],
    ['Langkah berikutnya', 'Next Moves'], ['Fokus yang disarankan', 'Recommended focus'], ['Berdasarkan skor terendah', 'Based on lowest scores'],
    ['Skala kematangan', 'Maturity Scale'], ['Arti setiap tingkat', 'What the levels mean'], ['Belum lengkap', 'Incomplete'], ['Awal', 'Initial'],
    ['Dapat diulang', 'Repeatable'], ['Berkembang', 'Developing'], ['Terdefinisi', 'Defined'], ['Terkelola', 'Managed'], ['Optimal', 'Optimized'], ['Adaptif', 'Adaptive'],
    ['Praktik belum ada atau belum diketahui.', 'Practice is absent or unknown.'], ['Praktik bersifat ad hoc dan reaktif.', 'Ad hoc and reactive practices.'],
    ['Praktik sudah ada tetapi bervariasi.', 'Practices exist but vary.'], ['Praktik dasar sudah ada tetapi bervariasi.', 'Basic practices exist but vary.'],
    ['Terdokumentasi dan dapat diulang.', 'Documented and repeatable.'], ['Praktik terdokumentasi dan dapat diulang.', 'Documented and repeatable practices.'],
    ['Terukur dan dikelola secara konsisten.', 'Measured and consistently governed.'], ['Terus ditingkatkan.', 'Continuously improving.'],
    ['Terus ditingkatkan dan adaptif.', 'Continuously improving and adaptive.'], ['Praktik privasi belum ada atau bersifat ad hoc.', 'Privacy practices are absent or ad hoc.'],
    ['Praktik privasi dan keamanan belum ada atau bersifat ad hoc.', 'Privacy and security practices are absent or ad hoc.'],
    ['Perlu penilaian', 'Needs assessment'], ['Di bawah target kematangan', 'Below target maturity'], ['Skor rata-rata keseluruhan', 'Overall Average Score'],
    ['Identifikasi', 'Identify'], ['Lindungi', 'Protect'], ['Deteksi', 'Detect'], ['Respons', 'Respond'], ['Pulihkan', 'Recover'],
    ['Tetapkan dan pantau strategi keamanan siber.', 'Establish and monitor cybersecurity strategy.'], ['Pahami aset, risiko, dan peluang.', 'Understand assets, risks and opportunities.'],
    ['Gunakan pengamanan untuk mengelola risiko.', 'Use safeguards to manage risk.'], ['Temukan dan analisis kemungkinan serangan.', 'Find and analyze possible attacks.'],
    ['Ambil tindakan atas insiden yang terdeteksi.', 'Take action regarding detected incidents.'], ['Pulihkan kapabilitas dan layanan.', 'Restore capabilities and services.'],
    ['Kelola risiko privasi di seluruh organisasi.', 'Manage privacy risk across the enterprise.'], ['IDENTIFIKASI-P', 'IDENTIFY-P'], ['TATA KELOLA-P', 'GOVERN-P'],
    ['KONTROL-P', 'CONTROL-P'], ['KOMUNIKASI-P', 'COMMUNICATE-P'], ['LINDUNGI-P', 'PROTECT-P'],
    ['Konteks Organisasi', 'Organizational Context'], ['Strategi Manajemen Risiko', 'Risk Management Strategy'], ['Peran, Tanggung Jawab, dan Wewenang', 'Roles, Responsibilities & Authorities'],
    ['Manajemen Aset', 'Asset Management'], ['Penilaian Risiko', 'Risk Assessment'], ['Peningkatan', 'Improvement'], ['Manajemen Risiko Rantai Pasok', 'Supply Chain Risk Management'],
    ['Manajemen Identitas, Autentikasi, dan Kontrol Akses', 'Identity Management, Authentication & Access Control'], ['Kesadaran dan Pelatihan', 'Awareness & Training'],
    ['Keamanan Data', 'Data Security'], ['Keamanan Platform', 'Platform Security'], ['Pemantauan Berkelanjutan', 'Continuous Monitoring'], ['Analisis Kejadian Merugikan', 'Adverse Event Analysis'],
    ['Proses Deteksi', 'Detection Processes'], ['Pelaporan Kejadian', 'Event Reporting'], ['Manajemen Insiden', 'Incident Management'], ['Analisis Insiden', 'Incident Analysis'],
    ['Pelaporan Respons Insiden', 'Incident Response Reporting'], ['Mitigasi Insiden', 'Incident Mitigation'], ['Pelaksanaan Rencana Pemulihan Insiden', 'Incident Recovery Plan Execution'],
    ['Komunikasi Pemulihan Insiden', 'Incident Recovery Communication'], ['Peningkatan Pemulihan', 'Recovery Improvements'], ['Tinjauan Pascainsiden', 'Post-Incident Review'],
    ['Inventarisasi dan Pemetaan', 'Inventory and Mapping'], ['Manajemen Pemrosesan Data', 'Data Processing Management'], ['Kebijakan, Proses, dan Prosedur Manajemen Risiko', 'Risk Management Policies, Processes, and Procedures'],
    ['Diagram radar ringkasan NIST CSF', 'Spider diagram NIST CSF Summary'], ['Diagram radar ringkasan kerangka privasi NIST', 'Spider diagram NIST Privacy Framework Summary'],
    ['Penilaian privasi berdasarkan Privacy Framework Core dan ringkasan kategori dari workbook.', 'Privacy assessment using the Privacy Framework Core and workbook category summaries.'],
    ['Kategori NIST Privacy 1.0', 'NIST Privacy 1.0 Categories'],
    ['Pustaka kerangka kerja', 'Framework library'], ['Workspace penilaian', 'Assessment Workspace'], ['Gambaran lebih jelas tentang', 'A clearer view of your'], ['kematangan keamanan Anda.', 'security maturity.'],
    ['Kelola assessment, identifikasi gap, dan dokumentasikan evidence dalam satu workspace.', 'Manage assessments, identify gaps, and document evidence in one workspace.'],
    ['Pilih kerangka kerja Anda', 'Choose your framework'], ['Pilih kerangka kerja untuk memulai atau melanjutkan assessment.', 'Choose a framework to start or continue your assessment.'],
    ['Keamanan Siber', 'Cybersecurity'], ['Privasi Data', 'Data Privacy'], ['Keamanan Informasi', 'Information Security'], ['6 Fungsi', '6 Functions'], ['5 Fungsi', '5 Functions'], ['100 Kontrol', '100 Controls'],
    ['Kebijakan + Praktik', 'Policy + Practice'], ['Buka CSF 2.0', 'Open CSF 2.0'], ['Buka Kerangka Privasi', 'Open Privacy Framework'], ['Buka ISO 27001:2022', 'Open ISO 27001:2022'],
    ['Ukur maturity keamanan siber berdasarkan Function, Category, dan Subcategory pada NIST Cybersecurity Framework 2.0.', 'Measure cybersecurity maturity using Functions, Categories, and Subcategories in NIST Cybersecurity Framework 2.0.'],
    ['Nilai pengelolaan risiko privasi berdasarkan Privacy Framework Core, lengkap dengan penilaian Policy dan Practice.', 'Assess privacy risk management using the Privacy Framework Core, including Policy and Practice assessments.'],
    ['Kelola assessment sertifikasi informasi berdasarkan Annex A clauses dan control objectives pada ISO 27001:2022.', 'Manage information security certification assessments using Annex A clauses and control objectives in ISO 27001:2022.'],
    ['Setiap assessment menghubungkan controls, catatan tindakan, dan evidence pendukung.', 'Each assessment connects controls, action notes, and supporting evidence.'],
    ['Administrasi Database', 'Database Administration'], ['Buat cadangan', 'Create backup'], ['Kontrol Pemulihan', 'Recovery Control'], ['Pulihkan database', 'Restore database'],
    ['Pilih file cadangan', 'Select backup file'], ['Belum ada file dipilih', 'No file selected'], ['Pulihkan cadangan terpilih', 'Restore selected backup'], ['Arsip Cadangan', 'Backup Archive'],
    ['Cadangan database tersedia', 'Available database backups'], ['Buat, unduh, dan restore backup database PostgreSQL.', 'Create, download, and restore PostgreSQL database backups.'],
    ['Restore mengganti data database saat ini. Gunakan file backup yang dibuat aplikasi ini.', 'Restoring replaces the current database data. Use a backup file created by this application.'],
    ['Backup hanya dapat diakses administrator.', 'Only administrators can access backups.'], ['Ukuran', 'Size'], ['Dibuat', 'Created'], ['Pulihkan', 'Restore'],
    ['Kelola Audit', 'Manage Audits'], ['Tambah Audit', 'Add Audit'], ['Semua status', 'All statuses'], ['Muat ulang', 'Reload'], ['Judul', 'Title'], ['Referensi', 'Reference'],
    ['Aksi', 'Action'], ['Sedang dikerjakan', 'In progress'], ['Kritis', 'Critical'], ['Tingkat keparahan', 'Severity'], ['Cari file', 'Search files'],
    ['Muat ulang daftar file', 'Reload file list'], ['File yang sudah diunggah', 'Previously uploaded files'], ['Gunakan template standar', 'Use default template'],
    ['Subjek email', 'Email subject'], ['Isi email', 'Email body'], ['Simpan reminder', 'Save reminder'], ['Muat ulang pengaturan', 'Reload settings'],
    ['Kirim email percobaan', 'Send test email'], ['Email tujuan percobaan', 'Test recipient email'], ['Pratinjau dengan data contoh', 'Preview with sample data'],
    ['Konten email reminder', 'Reminder email content'], ['Variabel', 'Variable'], ['Contoh', 'Example'], ['Pilih file yang pernah diunggah', 'Select previously uploaded files'],
    ['Tambahkan file', 'Add file'], ['Pilih bukti yang diunggah', 'Select uploaded evidence'], ['Belum ada bukti dipilih', 'No evidence selected'],
    ['Belum ada bukti baru dipilih', 'No new evidence selected'], ['Pilih satu atau lebih file dari Policy Register', 'Select one or more files from Policy Register'],
    ['Struktur Organisasi', 'Organization Structure'], ['Register Personel', 'Personnel Register'], ['Sertifikasi pegawai', 'Employee certifications'], ['Sertifikasi', 'Certification'],
    ['Daftarkan pegawai terlebih dahulu. Satu pegawai dapat memiliki banyak sertifikasi.', 'Register employees first. Each employee can have multiple certifications.'],
    ['Organisasi', 'Organization'], ['Departemen', 'Department'], ['Jabatan', 'Position'], ['Tanggal berlaku', 'Effective date'], ['Tanggal kedaluwarsa', 'Expiry date'],
    ['Tambah kebijakan', 'Add policy'], ['Simpan kebijakan', 'Save policy'], ['Kebijakan', 'Policy'], ['Praktik', 'Practice'], ['Bukti', 'Evidence'], ['Lampiran', 'Attachments'],
    ['Tambah vendor', 'Add vendor'], ['Simpan vendor', 'Save vendor'], ['Tambah kuesioner', 'Add questionnaire'], ['Simpan kuesioner', 'Save questionnaire'],
    ['Pertanyaan', 'Question'], ['Jawaban', 'Answer'], ['Kategori', 'Category'], ['Kontrol', 'Control'], ['Target', 'Target'], ['Kemungkinan', 'Likelihood'], ['Dampak', 'Impact'],
    ['Dashboard', 'Dashboard'], ['Ikhtisar', 'Overview'], ['Ringkasan', 'Summary'], ['Penilaian', 'Assessment'], ['Kemajuan', 'Progress'], ['Hasil', 'Results'],
    ['Lewati ke konten', 'Skip to content'], ['Fitur lengkap', 'All features'], ['Pratinjau aplikasi', 'Application preview'], ['Cara kerja', 'How it works'], ['Kerangka kerja', 'Frameworks'], ['Masuk', 'Sign in'],
    ['Semua kontrol', 'All controls'], ['Belum dinilai', 'Unscored'], ['Sudah dinilai', 'Scored'], ['Di bawah target', 'Below target'], ['Subkategori', 'Subcategory'],
    ['Kematangan kebijakan dan praktik', 'Policy and Practice maturity'], ['Alasan penilaian', 'Score reasoning'], ['Fungsi', 'Function'], ['Tata Kelola', 'Govern'],
    ['Tata Kelola Keamanan Siber', 'Cybersecurity Governance'], ['Risiko baru', 'New risk'], ['Atur ulang register risiko', 'Reset Risk Register'], ['Total risiko', 'Total risks'],
    ['risiko terdaftar', 'registered risks'], ['Prioritas tinggi', 'High priority'], ['tinggi atau sangat tinggi', 'high or very high'], ['Risiko residual tinggi', 'Residual high'],
    ['setelah penanganan', 'after treatment'], ['Terlambat', 'Overdue'], ['tenggat sebelum hari ini', 'deadline before today'], ['Ringkasan tingkat risiko', 'Risk Rating Summary'],
    ['Paparan saat ini', 'Current exposure'], ['Ringkasan penanganan', 'Treatment Summary'], ['Rencana respons', 'Response plan'], ['Nilai portofolio', 'Portfolio Value'],
    ['Rata-rata nilai aset', 'Asset value average'], ['rata-rata nilai CIA aset', 'average CIA asset value'], ['Entri register risiko', 'Risk Register Entry'],
    ['ID Risiko', 'Risk ID'], ['Kategori risiko', 'Risk category'], ['Aset terdampak', 'Effected asset'], ['Nama perangkat', 'Device name'], ['Pilih perangkat', 'Select device'],
    ['Pemilik risiko', 'Risk owner'], ['Kerahasiaan aset', 'Asset confidentiality'], ['Integritas aset', 'Asset integrity'], ['Ketersediaan aset', 'Asset availability'], ['Nilai aset', 'Asset value'],
    ['Kemungkinan (1-5)', 'Likelihood (1-5)'], ['Dampak (1-5)', 'Impact (1-5)'], ['Tingkat risiko', 'Risk rating'], ['Tindakan penanganan', 'Treatment action'],
    ['Belum ditetapkan', 'Unassigned'], ['Penerimaan', 'Acceptance'], ['Mitigasi', 'Mitigation'], ['Transfer', 'Transfer'], ['Penghindaran', 'Avoidance'], ['Ditutup', 'Closed'],
    ['Tenggat', 'Deadline'], ['Penanggung jawab tindakan', 'Owner of action'], ['Kemungkinan residual', 'Residual likelihood'], ['Dampak residual', 'Residual impact'], ['Tingkat residual', 'Residual rating'],
    ['Nomor formulir penerimaan', 'Acceptance form number'], ['Identifikasi risiko', 'Identification risk'], ['Kontrol risiko', 'Risk control'], ['Penyebab risiko', 'Risk cause'],
    ['Analisis risiko', 'Risk analysis'], ['Deskripsi penanganan risiko', 'Risk treatment description'], ['Deskripsi risiko residual', 'Residual risk description'], ['Catatan', 'Note'], ['Komentar', 'Comment'],
    ['Simpan risiko', 'Save risk'], ['Risiko terdaftar', 'Registered Risks'], ['Register risiko', 'Risk register'], ['Semua kategori', 'All categories'], ['Semua tingkat', 'All ratings'],
    ['Semua penanganan', 'All treatments'], ['Hapus filter', 'Clear filters'], ['Ekspor data', 'Export data'], ['Unduh contoh impor', 'Download import example'], ['Impor data', 'Import data'],
    ['Kelola risk register, indikator CIA, dampak, frekuensi, dan tindak lanjut risiko dalam satu ruang kerja.', 'Manage the risk register, CIA indicators, impact, frequency, and risk follow-up in one workspace.'],
    ['Pengelolaan Pilihan', 'Option Management'], ['Pengaturan register risiko', 'Risk Register Settings'],
    ['Tinjau 17 area fitur yang mendukung penilaian, pengelolaan risiko, kebijakan, dan administrasi. Pilih setiap area untuk melihat rincian kapabilitas.', 'Explore 17 feature areas supporting assessments, risk management, policies, and administration. Select an area to view its capabilities.'],
    ['Tinjau 12 tampilan aplikasi untuk memahami alur kerja dan penyajian informasi. Seluruh pratinjau menggunakan data demonstrasi.', 'Explore 12 application views to understand workflows and information presentation. All previews use demonstration data.'],
    ['PENILAIAN & KONTROL', 'ASSESSMENT & CONTROLS'], ['REGISTER & PENERIMAAN RISIKO', 'REGISTER & RISK ACCEPTANCE'], ['KEBIJAKAN & PENINJAUAN', 'POLICIES & REVIEWS'],
    ['TPRM & UJI TUNTAS', 'TPRM & DUE DILIGENCE'], ['DOKUMEN & BUKTI PENDUKUNG', 'DOCUMENTS & SUPPORTING EVIDENCE'], ['KOMPETENSI & HAK AKSES', 'COMPETENCY & ACCESS RIGHTS'],
    ['Bahasa', 'Language'], ['Halo', 'Hello'], ['Akun', 'Account'], ['Keluar', 'Logout'],
    ['Alat Tata Kelola TI', 'IT Governance Tools'], ['Selaraskan TI dengan kebutuhan bisnis', 'Align Your IT With Business need'],
    ['Tersimpan otomatis', 'Autosaved'], ['Peta penilaian', 'Assessment map'], ['Pilih kerangka kerja', 'Choose framework'],
    ['Penerimaan Risiko', 'Risk Acceptance'], ['Manajemen Risiko', 'Risk Management'], ['Pelacakan Temuan Audit', 'Audit Finding Tracker'],
    ['Register Kebijakan', 'Policy Register'], ['Sertifikasi Personel', 'Personnel Certification'], ['Pemodelan Ancaman', 'Threat Modelling'],
    ['Kerangka TPRM', 'TPRM Framework'], ['Matriks Tingkat Vendor', 'Vendor Tiering Matrix'], ['Kuesioner Uji Tuntas', 'Due Diligence Questionnaire'],
    ['Templat Kuesioner', 'Questionnaire Templates'], ['Register Risiko TPRM', 'TPRM Risk Register'], ['Kerangka Kerja', 'Framework'],
    ['Kerangka Privasi', 'Privacy Framework'], ['Kelola Privasi', 'Manage Privacy'], ['Kelola CSF', 'Manage CSF'],
    ['File yang diunggah', 'Uploaded files'], ['Sistem Pencadangan', 'Backup System'], ['Cadangan Database', 'Database Backup'], ['Cadangan File', 'File Backup'],
    ['Workspace lokal', 'Local workspace'], ['Ciutkan', 'Collapse'], ['Ciutkan sidebar', 'Collapse sidebar'], ['Perluas sidebar', 'Expand sidebar'],
    ['Navigasi utama', 'Main navigation'], ['Manajemen Akun', 'Account Management'], ['Simpan', 'Save'], ['Batal', 'Cancel'],
    ['Hapus', 'Delete'], ['Ubah', 'Edit'], ['Tambah', 'Add'], ['Tutup', 'Close'], ['Cari', 'Search'], ['Unduh', 'Download'],
    ['Unggah', 'Upload'], ['Ekspor', 'Export'], ['Impor', 'Import'], ['Lihat', 'View'], ['Buka', 'Open'], ['Kembali', 'Back'],
    ['Berikutnya', 'Next'], ['Sebelumnya', 'Previous'], ['Segarkan', 'Refresh'], ['Atur ulang', 'Reset'], ['Siap', 'Ready'],
    ['Memuat...', 'Loading...'], ['Menyimpan...', 'Saving...'], ['Tersimpan', 'Saved'], ['Nama', 'Name'], ['Deskripsi', 'Description'],
    ['Tanggal', 'Date'], ['Tindakan', 'Actions'], ['Pemilik', 'Owner'], ['Penanggung jawab', 'Responsible person'], ['Catatan', 'Notes'],
    ['Semua', 'All'], ['Aktif', 'Active'], ['Tidak aktif', 'Inactive'], ['Ya', 'Yes'], ['Tidak', 'No'], ['Rendah', 'Low'],
    ['Sedang', 'Medium'], ['Tinggi', 'High'], ['Sangat rendah', 'Very low'], ['Sangat tinggi', 'Very high'],
    ['Nama pengguna', 'Username'], ['Kata sandi', 'Password'], ['Peran', 'Role'], ['Simpan profil', 'Save profile'],
    ['Buat pengguna', 'Create user'], ['Simpan izin', 'Save permissions'], ['Hak Akses Peran', 'Role Access'],
    ['Matriks Akses Pengguna', 'User Access Matrix'], ['Administrasi', 'Administration'], ['Jejak Audit', 'Audit Trail'],
    ['Kelola profil dan keamanan akun.', 'Manage your profile and account security.'], ['Pengaturan Hak Akses', 'Access Settings'],
    ['Pengaturan SMTP', 'SMTP Settings'], ['Simpan pengaturan', 'Save settings'], ['Lokasi penyimpanan', 'Storage location'],
    ['Nama bucket', 'Bucket name'], ['Tes akses storage', 'Test storage access'], ['Pengaturan penyimpanan upload', 'Upload storage settings'],
    ['Selamat datang kembali', 'Welcome back'], ['Masukkan username', 'Enter your username'], ['Masukkan password', 'Enter your password'],
    ['Masuk untuk melanjutkan assessment Anda.', 'Sign in to continue your assessment.'], ['Masuk ke workspace', 'Sign in to workspace'],
    ['← Kembali ke beranda', '← Back to home'], ['Jeda animasi', 'Pause animation'], ['Putar animasi', 'Play animation'],
    ['Memproses login...', 'Signing in...'], ['Login gagal. Periksa kembali username dan password Anda.', 'Sign-in failed. Check your username and password.'],
    ['Permintaan terlalu lama. Silakan coba kembali.', 'The request timed out. Please try again.'],
    ['Tidak dapat terhubung ke server. Silakan coba kembali.', 'Unable to connect to the server. Please try again.'],
    ['Assessment, pengelolaan risiko, dan evidence dalam satu workspace yang terorganisir.', 'Assessment, risk management, and evidence in one organized workspace.'],
    ['Kejelasan untuk perjalanan', 'Clarity for your'], ['keamanan Anda.', 'security journey.'], ['WORKSPACE TATA KELOLA TI', 'IT GOVERNANCE WORKSPACE'],
    ['Tata Kelola Keamanan Informasi', 'Information Security Governance'], ['Tata kelola terpadu.', 'Integrated governance.'],
    ['Keputusan terarah.', 'Focused decisions.'], ['Keamanan terukur.', 'Measurable security.'], ['Masuk ke platform', 'Sign in to platform'],
    ['Pelajari fitur', 'Explore features'], ['Kapabilitas utama', 'Core capabilities'], ['Penilaian terstruktur.', 'Structured assessments.'],
    ['Tindak lanjut terarah.', 'Focused follow-up.'], ['Penilaian & kematangan', 'Assessment & maturity'], ['Manajemen risiko', 'Risk management'],
    ['Risiko pihak ketiga', 'Third-party risk'], ['Dokumentasi bukti', 'Evidence documentation'], ['Kompetensi & akses', 'Competency & access'],
    ['Cakupan platform', 'Platform scope'], ['Kapabilitas terintegrasi', 'Integrated capabilities'], ['untuk kebutuhan organisasi.', 'for organizational needs.'],
    ['Pratinjau platform', 'Platform preview'], ['Antarmuka terstruktur.', 'Structured interfaces.'], ['Informasi mudah ditinjau.', 'Easy-to-review information.'],
    ['Alur kerja', 'Workflow'], ['Kelola perbaikan secara berkelanjutan.', 'Manage continuous improvement.'], ['Evaluasi kondisi awal', 'Assess your starting point'],
    ['Tetapkan prioritas penanganan', 'Prioritize risk treatment'], ['Pantau dan tinjau hasil', 'Monitor and review results'], ['Akses platform', 'Platform access'],
    ['Perkuat tata kelola keamanan organisasi.', 'Strengthen organizational security governance.'], ['Tutup pratinjau', 'Close preview'],
    ['Pratinjau sebelumnya', 'Previous preview'], ['Pratinjau berikutnya', 'Next preview'],
    ['Kelola penilaian kontrol, risiko, kebijakan, dan bukti pendukung dalam satu platform. Dukung keputusan organisasi dengan informasi keamanan yang terstruktur dan dapat ditelusuri.', 'Manage control assessments, risks, policies, and supporting evidence in one platform. Support organizational decisions with structured, traceable security information.'],
    ['Mendukung fungsi tata kelola, manajemen risiko, dan kepatuhan organisasi.', 'Supports organizational governance, risk management, and compliance.'],
    ['Hubungkan hasil penilaian dengan pengelolaan risiko, penanggung jawab, dan dokumentasi untuk mendukung perbaikan berkelanjutan.', 'Connect assessment results with risk management, ownership, and documentation to support continuous improvement.'],
    ['Evaluasi kontrol berdasarkan NIST CSF, NIST Privacy Framework, dan ISO/IEC 27001. Dokumentasikan hasil penilaian dan penerapan kontrol secara terstruktur.', 'Evaluate controls using NIST CSF, NIST Privacy Framework, and ISO/IEC 27001. Document assessment results and control implementation in a structured way.'],
    ['Dokumentasikan risiko, tingkat paparan, rencana penanganan, dan keputusan penerimaan risiko sebagai dasar penetapan prioritas organisasi.', 'Document risks, exposure levels, treatment plans, and risk acceptance decisions to guide organizational priorities.'],
    ['Kelola kebijakan, penanggung jawab, dokumen pendukung, dan jadwal peninjauan. Gunakan pengingat email untuk mendukung ketepatan waktu evaluasi.', 'Manage policies, owners, supporting documents, and review schedules. Use email reminders to support timely reviews.'],
    ['Klasifikasikan vendor dan dokumentasikan uji tuntas melalui kuesioner terstruktur serta register risiko pihak ketiga.', 'Classify vendors and document due diligence through structured questionnaires and a third-party risk register.'],
    ['Kelola dokumen bukti dalam pustaka terpusat. Hubungkan dokumen dengan kontrol dan kebijakan untuk mendukung penelusuran serta evaluasi.', 'Manage evidence documents in a centralized library. Link documents to controls and policies for traceability and evaluation.'],
    ['Dokumentasikan sertifikasi personel dan rencana pengembangan kompetensi. Kelola akun dan hak akses sesuai peran pengguna.', 'Document personnel certifications and competency development plans. Manage accounts and access according to user roles.'],
    ['Akses NIST Basis untuk melanjutkan penilaian, meninjau risiko, dan mengelola dokumentasi keamanan informasi.', 'Access NIST Basis to continue assessments, review risks, and manage information security documentation.'],
    ['Pilih kerangka kerja dan lakukan penilaian untuk mengidentifikasi tingkat kematangan serta kesenjangan kontrol organisasi.', 'Choose a framework and assess organizational maturity and control gaps.'],
    ['Dokumentasikan risiko, tetapkan penanggung jawab, dan lengkapi bukti pendukung sebagai dasar tindak lanjut.', 'Document risks, assign owners, and gather supporting evidence for follow-up.'],
    ['Pantau jadwal peninjauan, gunakan pengingat, dan perbarui dokumentasi untuk menjaga relevansi informasi keamanan.', 'Monitor review schedules, use reminders, and update documentation to keep security information relevant.']
  ];
  const catalog = new Map();
  pairs.forEach(pair => pair.forEach(value => catalog.set(value, pair)));
  [
    ['Mulai assessment', 'Start assessment'],
    ['Overview dan assessment NIST Cybersecurity Framework 2.0 dalam satu halaman.', 'NIST Cybersecurity Framework 2.0 overview and assessment on one page.'],
    ['Assessment Privacy berdasarkan Privacy Framework Core dan ringkasan kategori dari workbook.', 'Privacy assessment using the Privacy Framework Core and workbook category summaries.']
  ].forEach(([alias, english]) => catalog.set(alias, catalog.get(english)));
  const storageKey = 'nist-basis-language';
  let language = 'id';
  try { language = localStorage.getItem(storageKey) === 'en' ? 'en' : 'id'; } catch (_) {}
  const normalize = value => value.trim().replace(/\s+/g, ' ');
  function translate(value) {
    const key = normalize(value);
    const dynamicPatterns = [
      [/^(\d+) of (\d+) controls scored$/, /^(\d+) dari (\d+) kontrol telah dinilai$/, m => `${m[1]} dari ${m[2]} kontrol telah dinilai`, m => `${m[1]} of ${m[2]} controls scored`],
      [/^(\d+) controls scored$/, /^(\d+) kontrol telah dinilai$/, m => `${m[1]} kontrol telah dinilai`, m => `${m[1]} controls scored`],
      [/^(\d+) controls$/, /^(\d+) kontrol$/, m => `${m[1]} kontrol`, m => `${m[1]} controls`],
      [/^([\w-]+) \/ (\d+) controls$/, /^([\w-]+) \/ (\d+) kontrol$/, m => `${m[1]} / ${m[2]} kontrol`, m => `${m[1]} / ${m[2]} controls`],
      [/^(\d+) risks?$/, /^(\d+) risiko$/, m => `${m[1]} risiko`, m => `${m[1]} risk${m[1] === '1' ? '' : 's'}`]
    ];
    for (const [english, indonesian, id, en] of dynamicPatterns) {
      const match = key.match(english) || key.match(indonesian);
      if (match) return value.replace(value.trim(), (language === 'en' ? en : id)(match));
    }
    const level = key.match(/^([0-5]) (Initial|Optimized|Adaptive|Awal|Optimal|Adaptif)$/);
    if (level) return value.replace(value.trim(), `${level[1]} ${translate(level[2])}`);
    const recommendation = key.match(/^(.*?) (?:Â·|·) (Needs assessment|Below target maturity|Perlu penilaian|Di bawah target kematangan)$/);
    if (recommendation) return value.replace(value.trim(), `${translate(recommendation[1])} · ${translate(recommendation[2])}`);
    const category = key.match(/^(.*?) (\([A-Z]{2}\.[A-Z]+(?:-P)?\))$/);
    if (category) return value.replace(value.trim(), `${translate(category[1])} ${category[2]}`);
    const tooltip = key.match(/^(Policy|Practice|Target|Kebijakan|Praktik): (.*)$/);
    if (tooltip) return value.replace(value.trim(), `${translate(tooltip[1])}: ${tooltip[2]}`);
    let pair = catalog.get(key);
    if (!pair) pair = pairs.find(p => p.some(v => v.toLowerCase() === key.toLowerCase()));
    if (!pair) return value;
    let result = pair[language === 'en' ? 1 : 0];
    if (key === key.toUpperCase()) result = result.toUpperCase();
    return value.replace(value.trim(), result);
  }
  const originals = new WeakMap();
  const excluded = 'script,style,textarea,code,pre,[contenteditable], [data-no-translate],#currentUser,#sidebarGreeting';
  function apply(root) {
    if (!root || root.nodeType !== 1 || root.closest(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded) || (parent.closest('td') && !parent.closest('button,a,[data-translate-ui]'))) continue;
      const old = originals.get(node);
      const source = old && node.nodeValue === old.output ? old.source : node.nodeValue;
      const output = translate(source);
      // Options without a value attribute use their label as the submitted value.
      if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) parent.setAttribute('value', parent.value);
      originals.set(node, { source, output });
      if (node.nodeValue !== output) node.nodeValue = output;
    }
    [root, ...root.querySelectorAll('[placeholder],[title],[aria-label]')].forEach(element => {
      if (element.closest(excluded)) return;
      ['placeholder', 'title', 'aria-label'].forEach(attribute => {
        if (element.hasAttribute(attribute)) {
          const source = element.getAttribute(attribute);
          const output = translate(source);
          if (source !== output) element.setAttribute(attribute, output);
        }
      });
    });
  }
  let observer;
  function refresh() {
    if (typeof document === 'undefined' || !document.body) return;
    if (observer) observer.disconnect();
    document.documentElement.lang = language;
    apply(document.body);
    document.querySelectorAll('[data-language-select]').forEach(select => { select.value = language; });
    if (observer) observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  }
  function setLanguage(value) {
    if (!['id', 'en'].includes(value)) return;
    language = value;
    try { localStorage.setItem(storageKey, value); } catch (_) {}
    refresh();
    global.dispatchEvent(new CustomEvent('nist:language-change', { detail: { language } }));
  }
  function mount() {
    const existing = document.querySelector('[data-language-select]');
    if (existing) {
      const host = document.querySelector('.top-actions');
      if (host) { existing.parentElement.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:12px system-ui;color:inherit'; host.prepend(existing.parentElement); }
      return;
    }
    const label = document.createElement('label');
    label.className = 'language-switcher';
    label.setAttribute('data-no-translate', '');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font:12px system-ui;color:inherit;';
    label.innerHTML = '<span>Bahasa / Language</span><select data-language-select aria-label="Bahasa / Language" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#1e293b"><option value="id">Indonesia</option><option value="en">English</option></select>';
    const host = document.querySelector('.top-actions') || document.querySelector('header nav') || document.querySelector('.login-form-panel');
    if (host) host.prepend(label);
    else { label.style.cssText += 'position:fixed;right:16px;top:12px;z-index:1000;background:white;padding:8px;border-radius:8px;color:#1e293b'; document.body.append(label); }
    label.querySelector('select').value = language;
    label.querySelector('select').addEventListener('change', event => setLanguage(event.target.value));
  }
  function start() {
    mount();
    observer = new MutationObserver(records => {
      observer.disconnect();
      const roots = new Set();
      records.forEach(record => {
        const root = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (root) roots.add(root);
      });
      roots.forEach(apply);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    });
    refresh();
  }
  global.NistI18n = { t: translate, setLanguage, refresh, mount, get language() { return language; }, pairs };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    global.addEventListener('storage', event => { if (event.key === storageKey) setLanguage(event.newValue === 'en' ? 'en' : 'id'); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
