-- 007_create_attendance_record.sql
CREATE TABLE IF NOT EXISTS attendance_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id UUID REFERENCES class_session(id) ON DELETE CASCADE,
  student_id UUID REFERENCES app_user(id), -- Use app_user id
  student_external_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent','justified')),
  method TEXT NOT NULL CHECK (method IN ('qr','manual_teacher','admin','ocr_upload')),
  recorded_by_actor_type TEXT,
  recorded_by_actor_id TEXT, -- UUID of the teacher/admin who recorded it
  device_timestamp TIMESTAMPTZ,
  server_timestamp TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('local_pending','synced','sync_error')) DEFAULT 'synced', -- Defaulted to synced for online
  offline_id UUID UNIQUE, -- To prevent duplicates on sync
  export_status TEXT NOT NULL CHECK (export_status IN ('pending','exported','error')) DEFAULT 'pending',
  UNIQUE(class_session_id, student_id), -- evita duplicados
  created_at TIMESTAMPTZ DEFAULT NOW()
);
