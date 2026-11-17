CREATE TABLE IF NOT EXISTS file_storage_locations (
        path TEXT PRIMARY KEY, root TEXT NOT NULL, object_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
