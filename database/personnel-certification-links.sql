-- Run inside a transaction after both personnel tables exist.
-- Retain legacy identity columns for compatibility; personnel_id is authoritative.
LOCK TABLE personnel_certifications, organization_personnel IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS personnel_id BIGINT;

-- Preserve existing certifications by registering their legacy owners once.
INSERT INTO organization_personnel (personnel_name, employee_id, personnel_role, supervisor_name)
SELECT DISTINCT ON (btrim(c.personnel_name), btrim(c.employee_id))
  btrim(c.personnel_name), btrim(c.employee_id), c.personnel_role, c.supervisor_name
FROM personnel_certifications c
WHERE c.personnel_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_personnel p
    WHERE btrim(p.personnel_name) = btrim(c.personnel_name)
      AND btrim(p.employee_id) = btrim(c.employee_id)
  )
ORDER BY btrim(c.personnel_name), btrim(c.employee_id), c.updated_at DESC, c.id DESC;

UPDATE personnel_certifications c
SET personnel_id = (
  SELECT p.id FROM organization_personnel p
  WHERE btrim(p.personnel_name) = btrim(c.personnel_name)
    AND btrim(p.employee_id) = btrim(c.employee_id)
  ORDER BY p.id LIMIT 1
)
WHERE c.personnel_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'personnel_certifications'::regclass
      AND conname = 'personnel_certifications_personnel_fk'
  ) THEN
    ALTER TABLE personnel_certifications
      ADD CONSTRAINT personnel_certifications_personnel_fk
      FOREIGN KEY (personnel_id) REFERENCES organization_personnel(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE personnel_certifications ALTER COLUMN personnel_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS personnel_certifications_personnel_idx ON personnel_certifications (personnel_id);
