DO $$ BEGIN
        LOCK TABLE file_storage_settings IN ACCESS EXCLUSIVE MODE;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'file_storage_settings'::regclass
          AND conname = 'file_storage_settings_mode_check' AND pg_get_constraintdef(oid) LIKE '%s3%') THEN
          ALTER TABLE file_storage_settings DROP CONSTRAINT IF EXISTS file_storage_settings_mode_check;
          ALTER TABLE file_storage_settings ADD CONSTRAINT file_storage_settings_mode_check CHECK (mode IN ('local', 'shared', 's3', 'gcs'));
        END IF;
      END $$
