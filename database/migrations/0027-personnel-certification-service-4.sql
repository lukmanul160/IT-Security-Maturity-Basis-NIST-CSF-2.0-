ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS certification_level TEXT NOT NULL DEFAULT 'Intermediate'
