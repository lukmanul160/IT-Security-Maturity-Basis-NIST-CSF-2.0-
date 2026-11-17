CREATE TABLE IF NOT EXISTS policy_register_dropdown_options (
    id BIGSERIAL PRIMARY KEY,
    field_name TEXT NOT NULL,
    option_value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT policy_register_dropdown_option_unique UNIQUE (field_name, option_value)
  )
