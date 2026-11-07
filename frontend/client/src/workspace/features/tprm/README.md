# Peta kode TPRM

Baca `docs/tprm-workflow.md` untuk aturan perilaku dan `docs/CODE_STRUCTURE.md`
untuk standar struktur proyek. Semua `.js` di folder ini adalah classic-script
fragments yang dirangkai `workspace/runtime.js`, bukan ES modules mandiri.

| File | Tanggung jawab |
| --- | --- |
| `navigation-and-questionnaires.js` | Navigasi dan pengisian kuesioner |
| `questionnaire-templates.js` | Pengelolaan template |
| `questionnaire-excel.js` | Dialog impor/ekspor workbook |
| `vendor-register.js` | Tabel vendor dan form assessment/risiko |
| `dashboard.js` | Ringkasan dan filter dashboard |
| `workflow-guidance.js` | Perhitungan panduan dari snapshot dan aktor; tanpa DOM/network |
| `workflow-guidance-view.js` | Escape pesan dan render shortcut tab; membaca konteks runtime |
| `lifecycle-view.js` | Render tab/riwayat dan baca kontrol dinamis |
| `lifecycle-form.js` | Bentuk payload dari draft form per aksi |
| `lifecycle.js` | State dialog, event dan orkestrasi API workflow |

Urutan runtime: register/dashboard ? guidance ? guidance view ? lifecycle view ? lifecycle form ? lifecycle ? Excel.
Fungsi guidance menerima label kontrol secara eksplisit agar dapat diuji sendiri.
View guidance mengakses `tprmLifecycleActor`, `canPerform`, dan `escapeHtml` saat
render setelah runtime siap. Jangan mengeksekusi fragment sendiri saat startup.

Backend: `tprmRoutes.js` ? `tprmController.js` ? `tprmWorkflowService.js`.
Service memakai `src/shared/tprmWorkflow.js` untuk aturan skor/fingerprint dan
`tprmGovernanceService.js` untuk penugasan, kontrak, acceptance dan jadwal.
GET workflow memberi snapshot; POST action divalidasi dan dicatat dalam transaksi.

Verifikasi: `npm run test:tprm`, `npm run test:tprm-browser`, `npm run build`.
Browser fixture membaca guidance dan lifecycle sesuai urutan produksi; tidak
menggunakan akun atau vendor operasional. Guidance bersifat advisory dan mengikuti
data tersimpan, sedangkan validasi transisi tetap dijalankan server.

Urutan lima fragment lifecycle ditentukan sekali pada grup `tprm-lifecycle` di `runtime-parts.json`; fixture browser membaca grup manifest tersebut.
