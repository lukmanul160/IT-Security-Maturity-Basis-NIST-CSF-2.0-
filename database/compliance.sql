CREATE TABLE IF NOT EXISTS compliance_reports (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS compliance_contacts (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS compliance_reminder_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  settings JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS compliance_report_files (
  id UUID PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES compliance_reports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compliance_report_files_report_idx ON compliance_report_files(report_id);
CREATE TABLE IF NOT EXISTS compliance_reminder_deliveries (
  report_id UUID NOT NULL REFERENCES compliance_reports(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  recipient TEXT NOT NULL,
  reminder_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, due_date, recipient, reminder_date)
);
