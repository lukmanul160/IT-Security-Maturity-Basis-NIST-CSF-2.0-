# Workspace feature sources

`../runtime.js` is the ordered entry point. `../../main.js` imports its assembled source and the existing classic-script bootstrap executes it once after Vue mounts the workspace markup.

Edit the feature source here, not generated assets:

- `policy-register/`: dropdowns, policy form, calendar, SMTP and email content.
- `uploaded-files/`: attachment listing, upload/download and edit workflows.
- `risk-management/`, `risk-acceptance/`: risk workflows.
- `tprm/`: vendors, due diligence and questionnaire templates.
- `personnel/`: organization, certifications and roadmap.
- `assessment/`, `privacy/`, `iso27001/`: framework workflows.
- `administration/`: accounts, permissions, backups and audit.
- `shared/`: shared state, startup, import/export and remaining cross-feature event bindings.

## Compatibility contract

These files are classic-script source fragments imported with Vite `?raw`, not independent ES modules. They are joined without separators in the original order, preserving shared lexical state, function hoisting, duplicate declaration precedence and event registration order. Do not add imports/exports to these fragments or execute them separately. The initial extraction was verified byte-for-byte against the previous runtime.

Some interleaved personnel/risk helpers and cross-feature listeners remain together to preserve order. Moving these or converting features to isolated Vue/ES modules requires explicit dependency and state management; this extraction does not claim to isolate shared state or reduce bundle size.

Run `npm run build:client`, `npm test`, and `npm run test:browser` after changing runtime behavior. Browser tests require the backend and configured test account. Edit page markup in `../components/*.vue`; `source.html` contains layout markers, shared styles and enhancements. `generated/` is recreated during build.

## Initial data loading

Do not start module-specific GET requests from top-level initialization or the
authentication callback. Load data when the view, tab, or dialog is opened.
`shared/module-loading.js` shares the initial CSF/Privacy load across their views
and permits retry after failure. Uploaded files loads its framework sources when
the file library is opened. Existing save/reload actions still refresh data.
IKAS and Threat Modelling load on navigation. Assessment year selectors query
only for the active framework. Reminder recipient pickers load when visible and
share cached data and concurrent requests; register mutations and manual reload
refresh that cache.

`test/moduleLoading.test.js` checks scoped loading, concurrent entry, and retries.
`scripts/test-compliance-office-browser.js` also checks startup network requests,
hidden recipient pickers, and framework navigation. With Monitoring Dashboard as
the initial view, only website identity, authentication, dashboard summary, and
office presence are requested by the workspace. This reduces data requests;
the legacy runtime is still assembled as one script bundle.
