CREATE TABLE IF NOT EXISTS policy_register (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    owner TEXT NOT NULL,
    review_cycle TEXT NOT NULL,
    approval_status TEXT NOT NULL,
    last_review DATE,
    attachment_name TEXT NOT NULL DEFAULT '',
    attachment_path TEXT NOT NULL DEFAULT '',
    attachment_type TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
