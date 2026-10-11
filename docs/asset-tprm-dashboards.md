# Asset and TPRM dashboards

Asset Management adds a Dashboard Asset tab alongside the existing register, racks and modelling pages. Independent read-only endpoint snapshots power scope filters, inventory/CIA distributions, renewal calendar, unique occupied rack units, and persisted canvas/relation coverage. Cards and charts open the existing lists with matching record IDs. Rack capacity counts occupied units once across front/rear placements. Retired/disposed assets are excluded from renewal attention. Unsaved canvas changes are excluded.

TPRM Risk Register retains its Dashboard/Register tabs and now includes the existing vendor, due-diligence and questionnaire-template sources. Framework and Tiering Matrix links open the existing pages. Vendor/search/risk/relationship/review filters intersect; vendor cards and review calendar drill into the existing register. Questionnaire cards and charts filter the original questionnaire list, with an explicit reset. Templates remain an independent library, clearly labelled as unaffected by vendor scope. CSV and JSON export only fetched, authorized data. Unavailable sources are identified; no invented financial exposure or expiration dates are added.

Both dashboards reuse shared governance/dashboard styling, support desktop/mobile widths, and add no second data table. Dashboard access derives from existing module permissions; each API retains its existing authorization.

Validation: `npm.cmd run build:client`, `npm.cmd test`, and `node scripts/test-asset-tprm-dashboards-browser.js`. Browser checks use real read-only APIs, compare KPI counts, verify drill/reset and questionnaire navigation, check 1440/768/390 widths, and reject uncaught exceptions. No business records are created or modified.
