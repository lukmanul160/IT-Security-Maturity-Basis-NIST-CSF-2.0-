CREATE TABLE IF NOT EXISTS compliance_security_checklist_files (
    id UUID PRIMARY KEY, checklist_id UUID NOT NULL REFERENCES compliance_security_checklists(id) ON DELETE CASCADE,
    row_id TEXT NOT NULL, column_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
    content BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
