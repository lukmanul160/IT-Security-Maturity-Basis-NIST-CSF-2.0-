ALTER TABLE policy_register ADD COLUMN IF NOT EXISTS related_note_ids JSONB NOT NULL DEFAULT '[]'::jsonb
