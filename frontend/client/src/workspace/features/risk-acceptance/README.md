# risk-acceptance

Form penerimaan risiko dan dashboard status pengesahan.

## Alur dan batas tanggung jawab

Form tersimpan tidak otomatis berarti disetujui; status mengikuti keputusan dan kelengkapan nama/tanda tangan/tanggal.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [dashboard.js](dashboard.js) | `raToday`, `raDate`, `raDays`, `raSigned`, `raModel`, `raRequestId` |
| [forms.js](forms.js) | `setRiskAcceptanceEditable`, `resetRiskAcceptanceForm`, `riskDate`, `riskFormData`, `fillRiskAcceptanceForm`, `viewRiskAcceptanceForm` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/risk-acceptance-dashboard.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
