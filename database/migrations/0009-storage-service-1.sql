CREATE TABLE IF NOT EXISTS file_storage_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL CHECK (mode IN ('local', 'shared')),
        directory TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
