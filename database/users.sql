-- PostgreSQL users table and default accounts.
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

-- Initial accounts for all environments, including production.
-- Change both initial passwords after first login (see installation guide).
-- Existing accounts and changed passwords are preserved on every startup.
INSERT INTO app_users (username, password_hash, role)
VALUES
  ('admin', '$2b$12$lEwoOcAxzn78Gb2Xa1FVi.pn50XKQi3xdkV9Zzg.i1gKcKcHFgieC', 'admin'),
  ('user', '$2b$12$H9ybtlawD2IqHPU6mH0lmuCU86aOaYVxsc3.Grl2PtfgCHRl8sHnu', 'user')
ON CONFLICT (username) DO NOTHING;
