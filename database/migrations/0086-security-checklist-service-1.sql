CREATE TABLE IF NOT EXISTS compliance_security_checklists (
    id UUID PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, assessor TEXT NOT NULL,
    data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
