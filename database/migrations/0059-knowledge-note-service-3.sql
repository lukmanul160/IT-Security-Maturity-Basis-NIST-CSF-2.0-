CREATE UNIQUE INDEX IF NOT EXISTS knowledge_notes_folder_title_unique ON knowledge_notes (folder, LOWER(title))
