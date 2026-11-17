-- PostgreSQL users table. Empty installations receive admin / admin.
-- Passwords are stored as bcrypt hashes, never as plaintext.

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';


ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK(role IN ('admin','approver','editor','viewer','user'));
ALTER TABLE tprm_due_diligence_questionnaires ADD COLUMN IF NOT EXISTS template_id BIGINT;
CREATE INDEX IF NOT EXISTS tprm_questionnaires_template_idx ON tprm_due_diligence_questionnaires(template_id);
ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS questionnaire_id BIGINT REFERENCES tprm_due_diligence_questionnaires(id) ON DELETE SET NULL;
