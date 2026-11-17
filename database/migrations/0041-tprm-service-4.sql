ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS risk_register_ids JSONB NOT NULL DEFAULT '[]'::jsonb
