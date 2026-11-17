CREATE TABLE IF NOT EXISTS budget_approvers (requester TEXT PRIMARY KEY, approver TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(requester <> approver))
