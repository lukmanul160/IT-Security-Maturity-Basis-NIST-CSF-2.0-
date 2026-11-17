-- Account data only; table structure belongs to database/migrations.
-- Serialize the empty-table check across concurrent provisioning processes.
-- Existing accounts are preserved; this never resets a changed password.
DO $$
BEGIN
  LOCK TABLE app_users IN EXCLUSIVE MODE;
  INSERT INTO app_users (username, full_name, password_hash, role)
  SELECT 'admin', 'Administrator', '$2b$12$Lr8MvfR5fOvf3lYbhR6Xs.rlDACmTZcZBCfv.3Q0WGY0af.bQ.2am', 'admin'
  WHERE NOT EXISTS (SELECT 1 FROM app_users);
END
$$;
