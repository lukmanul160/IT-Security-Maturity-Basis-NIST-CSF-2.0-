Module reminder schedules
=========================

The existing automatic-email modules are Policy Register (review dates), Audit
Finding (finding due dates), and Asset Management (renewal dates). Each supports
a selected central SMTP account, a lead time, an optional repeat interval in days
or months, and a maximum delivery count. Connection settings stay in central SMTP;
schedules, recipients and templates belong to their individual modules.

Use “Gunakan H-30 / setiap 5 hari” to populate a lead time of 30 days, a five-day
repeat interval, and seven maximum deliveries: H-30, H-25, H-20, H-15, H-10, H-5,
and H. The preset changes the form only; save to apply it. Existing configurations
are not overwritten merely by opening their settings.

Policy and Audit stop at the deadline. Assets can optionally continue after the
deadline, respecting the repeat interval and maximum count. Assets can use either
their existing per-record reminderDays or one module-wide lead time. Per-record
activation, owner email and renewal dates remain required; retired/disposed assets
are skipped. Legacy asset settings retain per-asset lead times and daily repetition.

Schedulers check hourly. A missed interval sends once at the next check rather than
sending every missed reminder. Delivery history prevents another successful email
within the same interval. Limits apply to each record, due date and recipient.
Failed sends may retry at the next check. Renewal or review date changes start a
new schedule. No new email workflow is implied for modules without a scheduler.

Tests mock SMTP transports. scripts/test-reminder-schedules-browser.js changes
form fields only, without saving settings or sending emails.
