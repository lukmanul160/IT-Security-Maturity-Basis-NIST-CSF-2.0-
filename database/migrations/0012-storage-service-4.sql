ALTER TABLE file_storage_settings ADD COLUMN IF NOT EXISTS cloud_config JSONB NOT NULL DEFAULT '{}'::jsonb
