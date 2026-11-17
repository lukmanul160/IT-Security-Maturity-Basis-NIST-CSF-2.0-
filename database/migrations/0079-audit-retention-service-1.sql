CREATE TABLE IF NOT EXISTS audit_retention_settings(id INTEGER PRIMARY KEY CHECK(id=1),settings JSONB NOT NULL,last_cleanup_at TIMESTAMPTZ,last_deleted_count INTEGER NOT NULL DEFAULT 0)
