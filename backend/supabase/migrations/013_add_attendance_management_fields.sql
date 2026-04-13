ALTER TABLE class_session
  ADD COLUMN IF NOT EXISTS cancelled_comment TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_teacher_id UUID REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_for_session_id UUID REFERENCES class_session(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_session_status_check'
  ) THEN
    ALTER TABLE class_session DROP CONSTRAINT class_session_status_check;
  END IF;
END $$;

ALTER TABLE class_session
  ADD CONSTRAINT class_session_status_check
  CHECK (status IN ('draft','open','closed','synced','cancelled'));
