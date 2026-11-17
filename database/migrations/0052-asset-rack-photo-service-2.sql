ALTER TABLE managed_asset_photos ADD COLUMN IF NOT EXISTS evidence_path TEXT;
ALTER TABLE asset_rack_photos ADD COLUMN IF NOT EXISTS evidence_path TEXT
