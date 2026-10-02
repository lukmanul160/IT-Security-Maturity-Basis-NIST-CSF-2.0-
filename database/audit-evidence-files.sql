-- Register legacy audit uploads in the same file library. Unknown owners stay admin-only.
UPDATE audit_finding_records
SET data = data || jsonb_build_object('attachmentPath', 'audit-finding/' || id::text || '/' || filename)
WHERE kind = 'evidence' AND filename IS NOT NULL AND NOT (data ? 'attachmentPath');

INSERT INTO evidence_files(path, name, content, mime_type, updated_at, uploaded_by)
SELECT data->>'attachmentPath', filename, content, 'application/octet-stream', updated_at, NULL
FROM audit_finding_records
WHERE kind = 'evidence' AND content IS NOT NULL AND filename IS NOT NULL AND data->>'attachmentPath' IS NOT NULL
ON CONFLICT (path) DO NOTHING;
