ALTER TABLE audit_finding_reminder_deliveries ADD COLUMN IF NOT EXISTS reminder_date DATE;
    UPDATE audit_finding_reminder_deliveries SET reminder_date=sent_at::date WHERE reminder_date IS NULL;
    ALTER TABLE audit_finding_reminder_deliveries ALTER COLUMN reminder_date SET NOT NULL;
    ALTER TABLE audit_finding_reminder_deliveries DROP CONSTRAINT IF EXISTS audit_finding_reminder_deliveries_pkey;
    ALTER TABLE audit_finding_reminder_deliveries ADD PRIMARY KEY(finding_id,due_date,recipient,reminder_date)
