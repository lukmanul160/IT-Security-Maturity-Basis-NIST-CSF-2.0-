# Audit Finding Tracker & Policy Register dashboards

Both dashboards use stored module records, shared workspace form/card styles, the global light/dark theme, and the existing management tables. No additional business tables or data migrations are required.

## Audit Finding Tracker

- Filter by audit, finding PIC, severity, status, and deadline (within 30 days, overdue, or missing).
- Finding filters retain the corresponding audit ancestors and follow-up/evidence descendants. Filters do not interpret follow-up/evidence dates as mitigation deadlines.
- KPIs show audits in scope, open findings, open High/Critical findings, overdue findings, closed findings with resolution percentage, and deadlines within 30 days.
- Severity, status, PIC, audit distribution, monthly deadline bars, and the calendar open the existing **Kelola Audit** tab with the chosen drill-down.
- The calendar and local attention alerts include only findings that are not Closed. Due today is not overdue; H-30 is included.
- Existing hierarchy navigation, forms, permissions, evidence ownership, SMTP settings, and reminder rules remain in use. Dashboard alerts do not send messages.
- CSV/JSON export respects global filters and active drill-down. A normal overview export includes audit ancestors and related descendants; finding drill-down exports matching findings.

## Policy Register

- Filter by category, owner, approval status, and review schedule. Register search/local filters and dashboard drill-down intersect with the global scope.
- KPIs show total policies, Approved input status, reviews in 30 days, overdue review, incomplete schedule, and policies with attachments.
- The next review uses the existing Annual/Biannual/Quarterly cycle calculation, clamps month ends, and validates Last review dates. Ad hoc has no periodic deadline and is not counted as an incomplete schedule.
- Charts show approval status, category, owner, cycle, and scheduled review month. Calendar and alert clicks open the existing **Policy** tab; its single register remains the editing/deletion surface.
- CSV/JSON exports and the register's Export data button use the filtered result. CSV escapes quotes/newlines and neutralizes spreadsheet formula prefixes.
- No historical trend, financial exposure, approval signature verification, or regulatory compliance score is inferred from unavailable fields.

Use `npm run build:client`, `npm test`, and `npm run test:governance-dashboards-browser` for verification. Browser fixtures intercept only module requests inside the test browser and do not change business records. The browser test uses an existing administrator session, exercises drill-down, hierarchy, editing, export payloads, refresh, light/dark themes, and desktop/tablet/mobile layouts.
