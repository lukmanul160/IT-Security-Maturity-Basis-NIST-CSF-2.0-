DO $$ DECLARE table_schema TEXT; BEGIN
    SELECT n.nspname INTO table_schema FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='knowledge_notes'::regclass;
    EXECUTE format('DROP INDEX IF EXISTS %I.knowledge_notes_title_unique',table_schema);
  END $$
