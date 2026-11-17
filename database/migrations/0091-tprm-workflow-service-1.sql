ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS workflow JSONB NOT NULL DEFAULT '{}'::jsonb
