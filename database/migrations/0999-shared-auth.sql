-- Shared authentication state. Tokens are hashed; no bearer credentials are stored.
CREATE TABLE IF NOT EXISTS auth_sessions (
  username TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  office_module TEXT NOT NULL DEFAULT 'account'
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry ON auth_rate_limits(expires_at);
