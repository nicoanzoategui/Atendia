-- 006_create_session_students.sql
CREATE TABLE IF NOT EXISTS class_session_student (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id UUID REFERENCES class_session(id) ON DELETE CASCADE,
  student_id UUID REFERENCES app_user(id), -- Changed from student_external_id to UUID for consistency
  student_external_id TEXT,
  enrollment_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
