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

-- Serialize the empty-table check across concurrent provisioning processes.
-- Existing accounts are preserved; this never resets a changed password.
DO $$
BEGIN
  LOCK TABLE app_users IN EXCLUSIVE MODE;
  INSERT INTO app_users (username, full_name, password_hash, role)
  SELECT 'admin', 'Administrator', '$2b$12$Lr8MvfR5fOvf3lYbhR6Xs.rlDACmTZcZBCfv.3Q0WGY0af.bQ.2am', 'admin'
  WHERE NOT EXISTS (SELECT 1 FROM app_users);
END
$$;
