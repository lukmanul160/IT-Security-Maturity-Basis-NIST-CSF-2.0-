CREATE TABLE IF NOT EXISTS assessment_periods (
  framework_id TEXT NOT NULL CHECK (framework_id IN ('csf','privacy','iso27001')),
  assessment_year INTEGER NOT NULL CHECK (assessment_year BETWEEN 2000 AND 2100),
  legacy BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB,
  source_year INTEGER,
  creation_mode TEXT NOT NULL CHECK (creation_mode IN ('legacy','new','duplicate')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (framework_id,assessment_year),
  CHECK ((legacy AND data IS NULL) OR (NOT legacy AND jsonb_typeof(data)='object'))
);
CREATE UNIQUE INDEX IF NOT EXISTS assessment_period_legacy_idx ON assessment_periods(framework_id) WHERE legacy;
CREATE TABLE IF NOT EXISTS assessment_period_files (
  framework_id TEXT NOT NULL,
  assessment_year INTEGER NOT NULL,
  path TEXT NOT NULL,
  PRIMARY KEY (framework_id,assessment_year,path),
  FOREIGN KEY (framework_id,assessment_year) REFERENCES assessment_periods(framework_id,assessment_year) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS assessment_period_files_path_idx ON assessment_period_files(path);
-- Preserve the installation's existing assessments as 2026 without moving data.
CREATE TABLE IF NOT EXISTS assessment_period_initializations (
  framework_id TEXT PRIMARY KEY
);
WITH initialized AS (
  INSERT INTO assessment_period_initializations(framework_id)
  VALUES ('csf'),('privacy'),('iso27001')
  ON CONFLICT DO NOTHING RETURNING framework_id
)
INSERT INTO assessment_periods(framework_id,assessment_year,legacy,creation_mode)
SELECT framework_id,2026,TRUE,'legacy' FROM initialized
ON CONFLICT DO NOTHING;
