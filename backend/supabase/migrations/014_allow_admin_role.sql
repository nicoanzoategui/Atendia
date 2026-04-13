DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_user_role_check'
  ) THEN
    ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
  END IF;
END $$;

ALTER TABLE app_user
  ADD CONSTRAINT app_user_role_check
  CHECK (role IN ('teacher','student','admin','admin_tenant','admin_app'));
