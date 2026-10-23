# Audit finding frontend

These files follow the classic-script contract in `../README.md`. The ordered
entry point is `../../runtime.js`; do not add ES imports or exports to fragments.

- `record-index.js`: pure hierarchy lookup by ID and parent. Rebuild the index
  when replacing the API snapshot. It retains references to records, so attachment
  updates do not require rebuilding. Parent/ID changes do require a rebuild.
- `detail-view.js`: renders the nested finding table from explicitly supplied
  data and helpers. It does not read the DOM or issue API requests.
- `tracker.js`: owns current records, navigation, filters, permissions, forms,
  evidence library, events and API calls.
- `../../components/AuditFindingView.vue`: page markup and form fields.
- `../../../../../public/theme.css`: shared light/dark styles, including nested
  finding cells selected by `[data-aft-details]`.

Descriptions in the Audit/Finding table use `white-space: pre-wrap` so line
breaks entered in the description textarea remain visible in the Details cell.

The index costs one pass over the API snapshot. ID and direct-child lookup avoid
scanning the entire list; ancestor traversal follows only the parent chain and
stops safely on missing parents or cycles. Child order matches API order.

Validation: `node --test test/auditFindingFrontend.test.js`,
`npm run build:client`, `npm test`, and `npm run test:browser` from the project root.
Do not edit generated frontend assets directly.
