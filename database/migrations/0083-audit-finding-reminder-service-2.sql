CREATE TABLE IF NOT EXISTS audit_finding_reminder_deliveries (
    finding_id UUID REFERENCES audit_finding_records(id) ON DELETE CASCADE,
    due_date DATE NOT NULL, recipient TEXT NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(finding_id,due_date,recipient))
