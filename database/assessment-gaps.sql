CREATE TABLE IF NOT EXISTS assessment_gaps (
  id UUID PRIMARY KEY,
  framework_id TEXT NOT NULL,
  control_code TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Closed')),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence)='array'),
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (framework_id,control_code) REFERENCES controls(framework_id,code) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS assessment_gaps_control_idx ON assessment_gaps(framework_id,control_code);
