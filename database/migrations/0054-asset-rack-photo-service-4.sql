CREATE OR REPLACE FUNCTION sync_asset_uploaded_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN
   DELETE FROM managed_asset_photos WHERE evidence_path=OLD.path;
   DELETE FROM asset_rack_photos WHERE evidence_path=OLD.path;
   RETURN OLD;
  END IF;
  IF NEW.content IS NOT NULL THEN
   UPDATE managed_asset_photos SET content=NEW.content,mime_type=NEW.mime_type,version=gen_random_uuid() WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type);
   UPDATE asset_rack_photos SET content=NEW.content,mime_type=NEW.mime_type,version=gen_random_uuid() WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type);
  END IF;
  RETURN NEW;
 END $$
