ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS due_diligence_assessment JSONB NOT NULL DEFAULT '{}'::jsonb
