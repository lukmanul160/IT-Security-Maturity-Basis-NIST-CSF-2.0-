CREATE OR REPLACE FUNCTION sync_note_uploaded_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM knowledge_note_images WHERE evidence_path=OLD.path; RETURN OLD; END IF;
 IF NEW.content IS NOT NULL THEN UPDATE knowledge_note_images SET content=NEW.content,mime_type=NEW.mime_type WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type); END IF;
 RETURN NEW; END $$
