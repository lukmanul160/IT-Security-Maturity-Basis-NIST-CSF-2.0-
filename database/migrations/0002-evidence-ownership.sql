-- Legacy files have no verified uploader; only administrators may select them.
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS uploaded_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS evidence_files_uploaded_by_idx ON evidence_files(uploaded_by);
