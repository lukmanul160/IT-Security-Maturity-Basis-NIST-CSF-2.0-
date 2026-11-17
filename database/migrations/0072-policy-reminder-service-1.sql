CREATE TABLE IF NOT EXISTS policy_reminder_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings JSONB NOT NULL, secret TEXT NOT NULL DEFAULT '')
