CREATE TABLE IF NOT EXISTS policy_register_items (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES policy_register(id) ON DELETE CASCADE,
    subtitle TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_register_item_content_check CHECK (subtitle <> '' OR content <> '')
  )
