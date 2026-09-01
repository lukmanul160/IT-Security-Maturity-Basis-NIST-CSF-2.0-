# Review dan dokumentasi kode aplikasi NIST Basis

## 1. Ringkasan arsitektur

Aplikasi ini adalah dashboard assessment keamanan berbasis browser + Node.js dengan backend Express, database PostgreSQL, dan UI single-page di `public/app.js` serta `public/index.html`.

Komponen utama:
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`, `public/modern.css`
- Backend: `src/server.js` dan modul di `src/`
- Konfigurasi: `src/config/*`
- Database: `database/*.sql`
- Script provisioning dan seed: `scripts/*.js`

Secara umum, aplikasi membagi kebutuhan menjadi beberapa domain:
- Assessment NIST CSF / Privacy Framework
- Evidence upload dan manajemen file
- Risk acceptance
- Risk management
- Personnel certification
- Third-party risk management (TPRM)

## 2. Kekuatan struktur kode

### 2.1 Model domain yang cukup jelas
Domain-domain sudah dipisah dengan variable state yang konsisten, seperti:
- `state` untuk CSF assessment
- `privacyState` untuk privacy assessment
- `riskAcceptanceForms` untuk formulir risk acceptance
- `riskManagementRows` untuk risk register
- `tprmRows` untuk TPRM
- `questionnaireRows` untuk due diligence questionnaires

Ini mempermudah pemeliharaan karena state terkait satu domain tidak bercampur terlalu banyak.

### 2.2 Nama fungsi relatif deskriptif
Banyak fungsi memakai nama yang khas dan ekspresif, misalnya:
- `loadRiskManagement()`
- `renderRiskRegister()`
- `saveRiskAcceptanceForm()`
- `showTprmRegisterView()`
- `openTprmRelatedRiskView()`

Nama seperti ini membantu pembaca cepat mengenali tujuan fungsi.

### 2.3 Ada pembagian kerja antara UI, state, dan data layer
Pola umum yang digunakan adalah:
- render data ke DOM
- update state
- kirim request ke API
- refresh UI setelah successful response

Polanya sudah cukup masuk akal untuk aplikasi dashboard seperti ini.

## 3. Masalah umum yang perlu diperbaiki

### 3.1 File `public/app.js` terlalu besar
Ini adalah masalah utama. Satu file besar dengan ratusan fungsi membuat:
- sulit mencari fungsi tertentu
- risiko konflik naming
- debugging lebih sulit
- kebutuhan review dan maintenance meningkat

Rekomendasi:
- pecah menjadi beberapa file seperti:
  - `public/app/csf.js`
  - `public/app/privacy.js`
  - `public/app/risk-management.js`
  - `public/app/tprm.js`
  - `public/app/uploads.js`
  - `public/app/common.js`
- atau gunakan modul ES module (`type="module"`) bila struktur aplikasi memungkinkan.

### 3.2 Banyak fungsi melakukan pekerjaan ganda
Banyak fungsi render dan save di satu blok. Ada pola yang berulang seperti:
- render ulang tabel
- validasi state
- request API
- update status UI

Jika berulang di banyak domain, sebaiknya dibuat helper umum seperti:
- `fetchJson()`
- `renderTableRows()`
- `updateStatus()`
- `safeJsonResponse()`
- `withBusyState()`

### 3.3 Beberapa fungsi mengubah state global yang sangat luas
Beberapa fungsi memodifikasi `riskManagementRows`, `state`, `privacyState`, dan `tprmRows` langsung di banyak tempat. Ini berisiko menimbulkan bug saat ada perubahan asynchronous atau race condition.

Rekomendasi:
- gunakan reducer atau helper update state
- hindari mutasi langsung yang tidak terkonsolidasi
- buat fungsi `setState` atau `commitState` bila memungkinkan

### 3.4 Manajemen event listener tersebar di banyak titik
Beberapa event listener dideklarasikan secara tersebar di seluruh file. Ini membuat urutan eksekusi lebih sukar diprediksi dan mempersulit maintenance.

Rekomendasi:
- kelompokan event binding di satu area per module
- buat `bindUiEvents()` untuk setiap domain

### 3.5 Duplicate logic untuk render pagination / table / rating
Ada banyak helper seperti `renderListPagination()`, `riskTierClass()`, `riskDate()`, dan formatter rating. Duplikasi ini dapat dipindah ke util yang lebih terpusat.

### 3.6 Potensi bug karena global variable dan re-assignment
Beberapa fungsi terlihat dibuat dengan assignment ulang seperti:
- `openTprmRelatedRiskView = row => ...`
- `renderTprmRiskPicker = row => ...`

Ini tidak ideal karena menyebabkan variabel global yang sulit dipantau dan diprediksi. Lebih baik:
- gunakan `function openTprmRelatedRiskView(row) { ... }`
- gunakan `const renderTprmRiskPicker = (row) => { ... }`

## 4. Panduan dokumentasi fungsi yang perlu ditambahkan

Untuk fungsi kompleks, tambahkan komentar seperti berikut:

```js
/**
 * Menyimpan status UI saat user berpindah antar view.
 * @param {string} view - nama view aktif
 * @param {string} functionId - fungsi CSF aktif
 */
const saveUiState = (view, functionId = activeFunction) => {
  localStorage.setItem(uiStorageKey, JSON.stringify({ view, function: functionId }));
};
```

```js
/**
 * Menghitung skor vendor berdasarkan parameter assessment.
 * Nilai total dipakai untuk menentukan tier vendor.
 * @param {object} values - nilai piiExposure, securityMaturity, financial, reputation
 * @returns {{ piiExposure: number, securityMaturity: number, financial: number, reputation: number, total: number }}
 */
function calculateVendorTierScore(values = {}) {
  // ...
}
```

```js
/**
 * Render daftar questionnaire vendor ke table.
 * Menampilkan risk tier, skor, status, dan aksi.
 */
function renderQuestionnaires() {
  // ...
}
```

## 5. Rekomendasi efisiensi kode

### 5.1 Gunakan helper reusable
Contoh:
- `fetchJson(url)`
- `postJson(url, body)`
- `updateTableStatusMessage(id, text)`
- `safeReadJson(response)`

Ini akan mengurangi duplikasi dan membuat kode lebih konsisten.

### 5.2 Batasi eksekusi render yang tidak perlu
Beberapa fungsi memanggil render table berulang saat event kecil terjadi. Jika banyak data, ini bisa membuat UI terasa lambat.

Rekomendasi:
- batasi re-render hanya pada bagian yang berubah
- gunakan `requestAnimationFrame` untuk UI update kompleks
- hindari render table besar berulang saat filter masuk ke input tiap keypress jika data besar

### 5.3 Gunakan debounce pada search/filter
Input pencarian seperti questionnaire dan risk register sering diproses setiap keystroke. Ini bisa menjadi berat pada data besar.

Contoh pola:
```js
let searchTimer = null;
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderQuestionnaires(), 150);
});
```

### 5.4 Optimasi API request
Beberapa endpoint bisa dipanggil bersama-sama, seperti pada `loadRiskManagement()` dan `loadCertifications()`, yang sudah dioptimalkan dengan `Promise.all()`; ini bagus.

Tetap pertahankan pola ini pada fitur lain agar performance tetap baik.

### 5.5 Validasi untuk form dan data besar
Sebaiknya ada guard untuk:
- input kosong
- data undefined
- rendering table kosong
- response API gagal yang tidak memiliki JSON

Ini mengurangi error runtime dan mempersingkat debugging.

## 6. Rekomendasi prioritas

### Prioritas tinggi
1. Pecah `public/app.js` menjadi beberapa modul domain
2. Standardisasi gaya fungsi dan penamaan
3. Hindari assignment ulang fungsi global
4. Tambahkan dokumentasi JSDoc untuk fungsi utama

### Prioritas menengah
1. Gunakan util fetch/helper umum
2. Terapkan debounce untuk pencarian dan filter
3. Kelompokkan event binding per modul

### Prioritas rendah
1. Refactor helper render table yang berulang
2. Tambahkan unit/integration test untuk fungsi kritikal
3. Pisahkan business logic dari DOM logic

## 7. Kesimpulan

Project ini secara umum sudah memiliki struktur yang cukup kuat untuk aplikasi manajemen keamanan dan assessment. Kelebihan utamanya adalah domain fitur yang terorganisir dengan cukup baik dan penggunaan API/DB yang konsisten.

Namun, file `public/app.js` sangat besar dan menjadi titik utama yang perlu di-refactor agar lebih efektif, efisien, dan mudah dipelihara. Dengan memecah modul, menambahkan dokumentasi fungsi, dan mengurangi duplikasi logic, aplikasi akan jauh lebih siap untuk berkembang.

## 8. Saran penerapan berikutnya

- Mulai dari domain paling besar: TPRM + Risk Management + CSF assessment
- Tambahkan JSDoc untuk 20 fungsi utama
- Buat helper `fetchJson` dan `renderTable` umum
- Refactor minimal satu domain per iterasi, bukan semua sekaligus

Dokumen ini bisa dijadikan acuan saat review kode dan refactor berikutnya.
