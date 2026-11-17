ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS questionnaire_id BIGINT REFERENCES tprm_due_diligence_questionnaires(id) ON DELETE SET NULL
