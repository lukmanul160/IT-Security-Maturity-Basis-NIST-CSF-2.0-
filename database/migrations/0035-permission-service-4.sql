ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user'))
