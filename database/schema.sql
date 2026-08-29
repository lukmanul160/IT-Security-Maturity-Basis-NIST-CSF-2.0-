-- PostgreSQL schema for NIST CSF 2.0 Maturity Assessment
-- Select the application database before running this file:
-- \c nist_basis

CREATE TABLE IF NOT EXISTS assessment_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_acceptance_forms (
  id BIGSERIAL PRIMARY KEY,
  requestor_name TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  department TEXT NOT NULL,
  previously_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  risk_description TEXT NOT NULL,
  benefit_justification TEXT NOT NULL,
  mitigation_plan TEXT NOT NULL,
  business_owner_decision TEXT NOT NULL CHECK (business_owner_decision IN ('temporary', 'one_year', 'denied')),
  remediation_date DATE,
  requestor_print_name TEXT NOT NULL DEFAULT '',
  requestor_email_phone TEXT NOT NULL DEFAULT '',
  requestor_signature TEXT NOT NULL DEFAULT '',
  requestor_date DATE,
  cio_comments TEXT NOT NULL DEFAULT '',
  cio_name TEXT NOT NULL DEFAULT '',
  cio_signature TEXT NOT NULL DEFAULT '',
  cio_date DATE,
  cis_decision TEXT NOT NULL CHECK (cis_decision IN ('approved', 'denied', 'conditional')),
  cis_reason TEXT NOT NULL DEFAULT '',
  cis_conditions TEXT NOT NULL DEFAULT '',
  cis_name TEXT NOT NULL DEFAULT '',
  cis_signature TEXT NOT NULL DEFAULT '',
  cis_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_acceptance_forms_updated_idx
  ON risk_acceptance_forms (updated_at DESC);

CREATE TABLE IF NOT EXISTS risk_indicators (
  id BIGSERIAL PRIMARY KEY,
  indicator_type TEXT NOT NULL,
  score INTEGER,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_indicators_type_idx
  ON risk_indicators (indicator_type, sort_order);

CREATE TABLE IF NOT EXISTS risk_register (
  risk_id TEXT PRIMARY KEY,
  risk_category TEXT NOT NULL,
  effected_asset TEXT NOT NULL,
  identification_risk TEXT NOT NULL,
  risk_control TEXT NOT NULL DEFAULT '',
  risk_cause TEXT NOT NULL DEFAULT '',
  risk_analysis TEXT NOT NULL DEFAULT '',
  asset_confidentiality INTEGER,
  asset_integrity INTEGER,
  asset_availability INTEGER,
  asset_value INTEGER,
  risk_owner TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  likelihood INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  risk_rating TEXT NOT NULL DEFAULT '',
  treatment_action TEXT NOT NULL DEFAULT '',
  acceptance_form_no TEXT NOT NULL DEFAULT '',
  risk_treatment_description TEXT NOT NULL DEFAULT '',
  owner_of_action TEXT NOT NULL DEFAULT '',
  deadline DATE,
  residual_risk_description TEXT NOT NULL DEFAULT '',
  residual_likelihood INTEGER,
  residual_impact INTEGER,
  residual_rating TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_register_rating_idx ON risk_register (risk_rating);
CREATE INDEX IF NOT EXISTS risk_register_owner_idx ON risk_register (risk_owner);

CREATE TABLE IF NOT EXISTS risk_dropdown_options (
  id BIGSERIAL PRIMARY KEY,
  field_name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT risk_dropdown_option_unique UNIQUE (field_name, option_value)
);

CREATE INDEX IF NOT EXISTS risk_dropdown_options_field_idx
  ON risk_dropdown_options (field_name, sort_order, option_value);

CREATE TABLE IF NOT EXISTS personnel_certifications (
  id BIGSERIAL PRIMARY KEY,
  personnel_name TEXT NOT NULL,
  employee_id TEXT NOT NULL DEFAULT '',
  personnel_role TEXT NOT NULL DEFAULT '',
  certification_name TEXT NOT NULL,
  issuer TEXT NOT NULL DEFAULT '',
  reference_url TEXT NOT NULL DEFAULT '',
  certification_level TEXT NOT NULL DEFAULT 'Intermediate',
  status TEXT NOT NULL DEFAULT 'Planned',
  issue_date DATE,
  expiry_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  on_canvas BOOLEAN NOT NULL DEFAULT FALSE,
  position_x INTEGER NOT NULL DEFAULT 24,
  position_y INTEGER NOT NULL DEFAULT 24,
  card_width INTEGER NOT NULL DEFAULT 260,
  card_height INTEGER NOT NULL DEFAULT 190,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personnel_certifications_name_idx
  ON personnel_certifications (personnel_name, certification_name);

CREATE TABLE IF NOT EXISTS tprm_risk_register (
  id BIGSERIAL PRIMARY KEY,
  third_party TEXT NOT NULL,
  service_dependency TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  assessment_status TEXT NOT NULL DEFAULT 'Not started',
  next_review DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tprm_risk_register_updated_idx
  ON tprm_risk_register (updated_at DESC);

CREATE TABLE IF NOT EXISTS questionnaire_templates (
  id BIGSERIAL PRIMARY KEY,
  template_name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS questionnaire_templates_default_idx
  ON questionnaire_templates (is_default);

CREATE TABLE IF NOT EXISTS tprm_due_diligence_questionnaires (
  id BIGSERIAL PRIMARY KEY,
  vendor_name TEXT NOT NULL,
  template_id BIGINT,
  assessment_status TEXT NOT NULL DEFAULT 'Draft',
  review_date DATE,
  assessment_result TEXT NOT NULL DEFAULT 'Pending',
  reviewer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tprm_questionnaires_updated_idx
  ON tprm_due_diligence_questionnaires (updated_at DESC);

CREATE INDEX IF NOT EXISTS tprm_questionnaires_template_idx
  ON tprm_due_diligence_questionnaires (template_id);

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

CREATE TABLE IF NOT EXISTS privacy_controls (
  id TEXT PRIMARY KEY,
  function TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  implementation TEXT NOT NULL DEFAULT '',
  "references" TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS privacy_controls_function_idx
  ON privacy_controls (function);

CREATE INDEX IF NOT EXISTS assessment_state_updated_idx
  ON assessment_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS evidence_files_updated_idx
  ON evidence_files (updated_at DESC);

CREATE INDEX IF NOT EXISTS csf_controls_category_idx
  ON csf_controls (category);

CREATE INDEX IF NOT EXISTS privacy_controls_category_idx
  ON privacy_controls (category);

CREATE TABLE IF NOT EXISTS frameworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT frameworks_id_not_blank CHECK (btrim(id) <> ''),
  CONSTRAINT frameworks_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT frameworks_version_not_blank CHECK (btrim(version) <> '')
);

CREATE TABLE IF NOT EXISTS controls (
  id BIGSERIAL PRIMARY KEY,
  framework_id TEXT NOT NULL REFERENCES frameworks (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  function TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  implementation TEXT NOT NULL DEFAULT '',
  "references" TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT controls_framework_code_unique UNIQUE (framework_id, code),
  CONSTRAINT controls_code_not_blank CHECK (btrim(code) <> '')
);

CREATE INDEX IF NOT EXISTS controls_framework_idx
  ON controls (framework_id);

CREATE INDEX IF NOT EXISTS controls_function_idx
  ON controls (framework_id, function);

CREATE INDEX IF NOT EXISTS controls_category_idx
  ON controls (framework_id, category);

INSERT INTO frameworks (id, name, version, description)
VALUES
  ('csf', 'NIST Cybersecurity Framework', '2.0', 'NIST CSF 2.0 controls'),
  ('privacy', 'NIST Privacy Framework', '1.0', 'NIST Privacy Framework controls')
ON CONFLICT (id) DO NOTHING;

INSERT INTO controls (framework_id, code, function, category, subcategory, implementation, "references")
SELECT 'csf', id, function, category, subcategory, implementation, "references"
FROM csf_controls
ON CONFLICT (framework_id, code) DO NOTHING;

INSERT INTO controls (framework_id, code, function, category, subcategory, implementation, "references")
SELECT 'privacy', id, function, category, subcategory, implementation, "references"
FROM privacy_controls
ON CONFLICT (framework_id, code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_state_id_not_blank') THEN
    ALTER TABLE assessment_state ADD CONSTRAINT assessment_state_id_not_blank CHECK (btrim(id) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_files_path_not_blank') THEN
    ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_path_not_blank CHECK (btrim(path) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evidence_files_name_not_blank') THEN
    ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_name_not_blank CHECK (btrim(name) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'csf_controls_id_not_blank') THEN
    ALTER TABLE csf_controls ADD CONSTRAINT csf_controls_id_not_blank CHECK (btrim(id) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'privacy_controls_id_not_blank') THEN
    ALTER TABLE privacy_controls ADD CONSTRAINT privacy_controls_id_not_blank CHECK (btrim(id) <> '');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);
