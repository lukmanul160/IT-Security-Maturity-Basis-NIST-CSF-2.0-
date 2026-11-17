CREATE TABLE IF NOT EXISTS audit_finding_records (
    id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('audit','finding','followup','evidence')),
    parent_id UUID REFERENCES audit_finding_records(id) ON DELETE RESTRICT,
    data JSONB NOT NULL, filename TEXT, content BYTEA, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK ((kind = 'audit') = (parent_id IS NULL))
  )
