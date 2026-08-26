-- PostgreSQL users table and default accounts.
-- Passwords are stored as bcrypt hashes, never as plaintext.

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';

INSERT INTO app_users (username, password_hash, role)
VALUES
  ('admin', '$2b$12$f0T2r3sXfXLj7PQg1h7caeiRKR60H3EhfbqynU/iAmXcVSTtn4v5a', 'admin'),
  ('user', '$2b$12$NthjzYiK6jgmWKoAc5IWwuQWvVC8lal8DomHNGdftAbsS8WmKXQGS', 'user')
ON CONFLICT (username) DO NOTHING;
