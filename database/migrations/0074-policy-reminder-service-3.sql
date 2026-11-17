ALTER TABLE policy_reminder_deliveries ADD COLUMN IF NOT EXISTS reminder_date DATE;
    UPDATE policy_reminder_deliveries SET reminder_date=sent_at::date WHERE reminder_date IS NULL;
    ALTER TABLE policy_reminder_deliveries ALTER COLUMN reminder_date SET NOT NULL;
    ALTER TABLE policy_reminder_deliveries DROP CONSTRAINT IF EXISTS policy_reminder_deliveries_pkey;
    ALTER TABLE policy_reminder_deliveries ADD PRIMARY KEY(policy_id,due_date,recipient,reminder_date)
