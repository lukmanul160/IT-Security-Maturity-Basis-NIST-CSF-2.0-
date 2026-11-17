CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_username, created_at DESC)
