# Komponen tampilan workspace

Komponen Vue adalah sumber markup. `v-pre` memakai handler classic-script dari
`../features/`; komponen dengan `<script setup>` memakai reaktivitas Vue langsung.
Pertahankan ID DOM, ref, event dan props saat merapikan tampilan.

| Kelompok | Komponen utama | Behavior / backend |
| --- | --- | --- |
| Assessment | Csf*, Assessment*, Privacy*, Iso27001*, Ikas*, Framework* | features assessment/privacy/iso27001/ikas; layanan framework/assessment |
| Risiko | RiskManagement*, RiskAcceptance*, AuditFinding*, ThreatModelling* | features risk*/audit-finding; layanan risk*/auditFinding/threatModel |
| TPRM | Tprm*, QuestionnaireTemplate* | features/tprm; layanan tprm*/questionnaireTemplate |
| Kebijakan | PolicyRegister* | features/policy-register; layanan policy* |
| Aset | AssetManagement* | script setup; layanan asset* |
| Pengetahuan | KnowledgeNotes*, KnowledgeGraph*, KnowledgeTextEditor* | features/shared/note*.mjs; layanan knowledge* |
| Anggaran | BudgetView*, BudgetCharts* | script setup; layanan budget* |
| Kepatuhan | Compliance*, OfficeDesign* | features compliance/office-design; layanan compliance*/statement*/officeDesign |
| Administrasi | Account*, Backups*, FileBackups*, Files* | features administration/uploaded-files; layanan account/backup/file/storage |
| Bersama | AppHeader*, AppSidebar*, MonitoringDashboard*, ReminderRecipientPicker* | shared state/navigation; monitoring dan reminder recipients |

## Standar UI yang diperiksa

Semua tombol memiliki `type` eksplisit: aksi form menggunakan submit dan
navigasi/toolbar menggunakan button. `npm run check:structure` memeriksa AST Vue,
termasuk atribut dinamis dan v-pre, sehingga tanda `>` pada ekspresi tidak merusak
pemeriksaan. Ini mempertahankan aksi submit yang sebelumnya implisit.

Gunakan kelas panel/tombol/form dan token tema yang sudah ada. Empty, loading,
error, read-only dan busy harus dibedakan; jangan menampilkan data yang gagal
dimuat sebagai angka nol. Shortcut bukan tab aktif. Escape data pengguna pada
HTML legacy; interpolasi Vue tetap mengikuti mekanisme escaping Vue.

Katalog fungsi semua script setup ada pada `docs/source-catalog.json`. Build dan
unit test tidak menggantikan audit visual semua viewport atau pengujian perangkat.
