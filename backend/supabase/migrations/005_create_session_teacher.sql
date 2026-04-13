-- 005_create_session_teacher.sql
CREATE TABLE IF NOT EXISTS class_session_teacher (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id UUID REFERENCES class_session(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES app_user(id), -- Changed from teacher_external_id to UUID for consistency
  teacher_external_id TEXT,
  role TEXT,
  can_open_attendance BOOLEAN DEFAULT true,
  can_close_attendance BOOLEAN DEFAULT true,
  can_edit_attendance BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
