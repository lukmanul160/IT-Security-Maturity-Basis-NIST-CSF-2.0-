# Shared theme and language controls

Every workspace module uses the shared overrides in `frontend/public/theme.css`,
loaded by `frontend/client/src/main.js`. Keep button foreground, background and
border together. Toolbar surface rules exclude primary, destructive and selected
controls. Active tabs and pressed buttons retain a blue surface and white label in
both themes; generic quiet-button rules must not override that state.

The reviewed page dictionary in `frontend/public/i18n.js` completes labels for
administration, budgets, compliance/reporting, contacts, backup, office design,
risk guidance, technology assets and checklists. Reviewed pairs override earlier
identity entries. User values, template field keys, technical abbreviations and
product names are not translated. `test/i18nCoverage.test.js` checks static text,
accessible labels and literal `t()` calls in every Vue component, plus landing,
login and virtual-office markup. Explicit exceptions cover technical identifiers.

Run `npm run test:shared-controls-browser` with Chrome (or `CHROME_PATH`). The
offline fixture renders authored templates from all 40 components and public
pages with their source CSS; Vue scope attributes are retained. It checks enabled
button labels against a 4.5:1 contrast threshold in light/dark × Indonesian/English,
including the selected-tab regression. It includes hidden dialog markup and uses
both endpoint colors for button gradients. No application server, database,
credentials, scanning, email or business mutations are involved.

This is a CSS and translation regression check, not an end-to-end execution of
every module workflow. It does not render runtime-generated controls or arbitrary
user content, measure text against photographs/canvas, or certify accessibility.
Existing i18n browser tests separately check language switching while retaining
form and user values. Technology Asset and Checklist browser suites exercise their
reactive UI with fixture APIs.

Validated on Node 24.19.0 and local headless Chrome: 685 authored workspace controls
and 44 public-page controls per language/theme combination; i18n/theme/source tests,
both module browser suites, and frontend build. Existing Vite legacy-script, font
resolution and large-chunk warnings remain. Docker/cloud were not run.
