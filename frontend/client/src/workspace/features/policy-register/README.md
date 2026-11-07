# policy-register

Register kebijakan, editor dokumen, relasi catatan, kalender dan reminder.

## Alur dan batas tanggung jawab

Review date dihitung dari siklus tersimpan. Editor, lampiran, catatan terkait dan SMTP memiliki jalur penyimpanan berbeda.

Markup utama berada di `../../components/`; urutan classic-script di `../../runtime.js`.
File `.js` runtime tidak boleh diberi import/export tanpa migrasi dependency.
File `.mjs` mempertahankan kontrak ES module yang sudah ada.

## File sumber

| File | Titik masuk fungsi (contoh) |
| --- | --- |
| [dashboard.js](dashboard.js) | `pdNext`, `pdMatches`, `pdGlobalRows`, `pdVisibleRows`, `pdClearLocal`, `pdReset` |
| [dropdowns.js](dropdowns.js) | `getPolicyDropdownOptions`, `getStoredPolicyDropdownOptions`, `loadPolicyDropdownOptionsFromServer`, `savePolicyDropdownOption`, `updatePolicyDatalist`, `updatePolicySelectOptions` |
| [email-reminder.js](email-reminder.js) | `policySmtpRequest`, `previewPolicySmtp`, `populatePolicySmtp` |
| [form.js](form.js) | `policyRelatedFolderNotes`, `setPolicyRelatedFolder`, `renderPolicyRelatedNotes`, `loadPolicyKnowledgeNotes`, `policyRelatedMarkup`, `policySearchText` |
| [register-and-calendar.js](register-and-calendar.js) | `getPolicyReviewCycleMonths`, `canEditPolicyDocument`, `openPolicyDocumentEditor`, `getPolicyNextReviewDate`, `renderPolicyReviewCalendar`, `renderPolicyRegisterRows` |

## Dokumentasi dan verifikasi

Dokumen terkait: `docs/policy-word-editor.md`, `docs/policy-knowledge-relations.md`, `docs/policy-email-reminders.md`.
Daftar fungsi lengkap, parameter dan lokasi ada pada `docs/source-catalog.json`.
Jalankan `npm run check:structure`, `npm run test:isolated`, dan `npm run build`.
Gunakan fixture browser modul terkait untuk perubahan interaksi; kelulusan build
bukan bukti API produksi, cloud, email atau semua ukuran layar sudah diuji.
