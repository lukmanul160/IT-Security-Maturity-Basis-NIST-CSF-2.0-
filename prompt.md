Role & Context:
Anda adalah Principal Enterprise Fullstack Architect. Saya sedang mengembangkan aplikasi web NIST CSF 2.0 Maturity Assessment Tool khusus untuk repositori [https://github.com/lukmanul160/IT-Security-Maturity-Basis-NIST-CSF-2.0-](https://github.com/lukmanul160/IT-Security-Maturity-Basis-NIST-CSF-2.0-).

Kondisi Backend & Database Saat Ini (Tetap Dipertahankan):

Backend: Node.js v18+ (Express v5) dengan arsitektur Controller-Service-Repository (src/controllers/, src/services/, src/routes/).

Database: PostgreSQL (pg) dengan model generik ter-normalisasi (frameworks, controls, evidence_files, app_users, personnel_certifications, certification_roadmap_catalog).

Build System: Tailwind CSS v4 (@tailwindcss/cli).

Tujuan Utama Prompt:
Merombak total frontend dari HTML5/Vanilla JS murni (di folder public/) menjadi React JS (SPA) menggunakan Vite dan Tailwind CSS v4 dengan arsitektur Feature-Based Modular Structure berstandar industri enterprise.

1. Arsitektur Frontend React (src/client/)
Terapkan struktur direktori berbasis domain fitur agar clean code, modular, dan mudah dipelihara:

src/client/core/: Reusable UI components (Modals, Custom Inputs, Dynamic Tables, Stat Cards, Badges, Toast Notifications), Custom Hooks (useAuth, useFetch), dan HTTP Client (apiClient.js dengan Cookie HttpOnly credentials: 'include').

src/client/features/ (Modul Bisnis Spesifik Proyek):

features/auth/: Login session management & Auth Context (mengonsumsi /api/users/login, app_users).

features/dashboard/: Overview maturity score (skala 0–4), completion progress, priority gaps tracker, dan visualisasi Canvas Radar Chart.

features/assessment/: Pengisian skor terpisah Policy Maturity vs Practice Maturity, Action Notes, serta modal pemetaan evidence pada subcategory NIST CSF 2.0 & Privacy Framework (/api/csf, /api/frameworks).

features/evidence/: Manager berkas evidence dengan struktur folder Function (Govern, Identify, Protect, Detect, Respond, Recover), Batch Upload (POST /api/files/batch), Search, dan Pagination (max 10 item/hal).

features/risk/: Form Cybersecurity Risk Acceptance, approval decision workflow (Business Owner, CIO, CISO), dan trigger export PDF (GET /api/risk-acceptance/:id/export/pdf).

features/certifications/: Form register pegawai (personnel_certifications) dan viewer catalog Security Certification Roadmap 9 (certification_roadmap_catalog).

2. Standar UI/UX Enterprise Cybersecurity Dashboard
Design System & Visual: Tampilan Dark/Light Mode adaptif dengan skema warna spesifik cybersecurity (Slate/Zinc neutral background, Emerald untuk High Maturity/Low Risk, Amber untuk Medium Risk, Rose/Red untuk Priority Gaps/High Risk, dan Cyan/Indigo untuk Primary Controls).

Responsivitas & Layout Adaptif:

Mobile (<1024px): Off-canvas collapsible drawer untuk navigasi utama, format stacked-card untuk tabel kompleks, serta touch targets minimal 44x44px.

Desktop (>=1024px): Sidebar fixed/sticky dengan toggle expanded/collapsed, multi-column grid, dan topbar sticky yang memuat indikator health check database (/api/health/db), search bar global, dan profile dropdown.

Data Visualization (Native Performance): Gunakan HTML5 Canvas API murni (useRef) yang dibungkus dalam komponen React (MaturityRadarChart.jsx) untuk menggambar Radar Chart 6 Function NIST CSF tanpa library grafik eksternal (Chart.js/Recharts).

3. Deliverables Kode yang Diharapkan
Pembaruan Build Setup: Penyesuaian package.json dan vite.config.js agar Vite berfungsi sebagai frontend bundler untuk Express server.

apiClient.js: Module API client murni berbasis Fetch API dengan penanganan cookie HttpOnly terpusat.

DashboardLayout.jsx: Shell UI utama dengan Sidebar responsif, Topbar dengan status server, dan tempat penampung konten.

MaturityRadarChart.jsx: Komponen React native Canvas API untuk visualisasi Radar Chart kematangan NIST CSF.

AssessmentGrid.jsx: Komponen tabel scoring Policy & Practice (0–4) lengkap dengan input Action Notes dan Evidence File Selector.

Berikan panduan eksekusi step-by-step beserta contoh kode React JS (JSX) dan Tailwind CSS v4 yang bersih, modular, dan siap diimplementasikan langsung pada repositori ini.