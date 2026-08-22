-- PostgreSQL schema for NIST CSF 2.0 Maturity Assessment
-- Select the application database before running this file:
-- \c nist_basis

CREATE TABLE IF NOT EXISTS assessment_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_files (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content BYTEA,
  mime_type TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE evidence_files
  ALTER COLUMN content DROP NOT NULL;

CREATE INDEX IF NOT EXISTS evidence_files_name_idx
  ON evidence_files (name);

CREATE TABLE IF NOT EXISTS csf_controls (
  id TEXT PRIMARY KEY,
  function TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  implementation TEXT NOT NULL DEFAULT '',
  "references" TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csf_controls_function_idx
  ON csf_controls (function);
