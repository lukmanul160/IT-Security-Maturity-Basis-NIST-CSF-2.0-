ALTER TABLE tprm_due_diligence_questionnaires ADD COLUMN IF NOT EXISTS responses JSONB NOT NULL DEFAULT '{}'::jsonb
