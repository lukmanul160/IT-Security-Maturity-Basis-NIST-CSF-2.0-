CREATE TABLE IF NOT EXISTS compliance_statement_types (
 id uuid PRIMARY KEY,
 title text NOT NULL,
 body text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS compliance_statement_submissions (
 id uuid PRIMARY KEY,
 type_id uuid NOT NULL REFERENCES compliance_statement_types(id),
 nip text NOT NULL,
 data jsonb NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statement_submissions_nip ON compliance_statement_submissions(nip, created_at DESC);
ALTER TABLE compliance_statement_types ADD COLUMN IF NOT EXISTS fields jsonb;
ALTER TABLE compliance_statement_types ADD COLUMN IF NOT EXISTS docx bytea;
ALTER TABLE compliance_statement_types ADD COLUMN IF NOT EXISTS document_name text;
ALTER TABLE compliance_statement_submissions ADD COLUMN IF NOT EXISTS document bytea;

CREATE TABLE IF NOT EXISTS compliance_statement_employees (
 nip text PRIMARY KEY, name text NOT NULL, department text NOT NULL DEFAULT '',
 position text NOT NULL DEFAULT '', status text NOT NULL DEFAULT '', provider text NOT NULL DEFAULT '',
 password_hash text NOT NULL, credential_version bigint NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true, password_changed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS compliance_statement_employee_sessions (
 token_hash text PRIMARY KEY, nip text NOT NULL REFERENCES compliance_statement_employees(nip) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, credential_version bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS statement_employee_session_expiry ON compliance_statement_employee_sessions(expires_at);
CREATE TABLE IF NOT EXISTS compliance_statement_assignments (
 nip text NOT NULL REFERENCES compliance_statement_employees(nip), year integer NOT NULL CHECK(year BETWEEN 2000 AND 2100),
 type_id uuid NOT NULL REFERENCES compliance_statement_types(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(nip,year,type_id)
);
ALTER TABLE compliance_statement_submissions ADD COLUMN IF NOT EXISTS assignment_year integer;
CREATE INDEX IF NOT EXISTS statement_assignment_submissions ON compliance_statement_submissions(nip,assignment_year,type_id);

ALTER TABLE compliance_statement_employees ADD COLUMN IF NOT EXISTS credential_version bigint NOT NULL DEFAULT 1;
ALTER TABLE compliance_statement_employee_sessions ADD COLUMN IF NOT EXISTS credential_version bigint NOT NULL DEFAULT 0;

ALTER TABLE compliance_statement_employees ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

-- Old sessions predate the prohibition on predictable NIP passwords.
ALTER TABLE compliance_statement_employee_sessions ADD COLUMN IF NOT EXISTS password_policy_version integer NOT NULL DEFAULT 0;
