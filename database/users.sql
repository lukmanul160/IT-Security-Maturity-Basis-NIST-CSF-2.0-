-- PostgreSQL users table. Provision the first administrator with admin:create.
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

-- No shared passwords or automatic accounts in any environment.
-- Existing accounts are preserved; this schema never rotates their passwords.
