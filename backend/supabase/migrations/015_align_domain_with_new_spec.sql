ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'es-AR',
  ADD COLUMN IF NOT EXISTS settings_jsonb JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE class_session
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS modality TEXT DEFAULT 'in_person',
  ADD COLUMN IF NOT EXISTS location_campus TEXT,
  ADD COLUMN IF NOT EXISTS location_building TEXT,
  ADD COLUMN IF NOT EXISTS location_classroom TEXT,
  ADD COLUMN IF NOT EXISTS location_floor TEXT,
  ADD COLUMN IF NOT EXISTS location_online_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata_jsonb JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE class_session
SET
  external_id = COALESCE(external_id, external_class_session_id),
  name = COALESCE(name, 'Clase ' || to_char(date, 'YYYY-MM-DD')),
  subject = COALESCE(subject, ''),
  modality = COALESCE(modality, 'in_person'),
  location_classroom = COALESCE(location_classroom, classroom)
WHERE true;

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
  CHECK (status IN ('scheduled','attendance_open','attendance_closed','finalized','cancelled'));

ALTER TABLE class_session
  ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_session_tenant_external_id
  ON class_session(tenant_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE class_session_teacher
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE class_session_teacher cst
SET tenant_id = cs.tenant_id
FROM class_session cs
WHERE cst.class_session_id = cs.id
  AND cst.tenant_id IS NULL;

ALTER TABLE class_session_student
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id),
  ADD COLUMN IF NOT EXISTS student_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE class_session_student css
SET tenant_id = cs.tenant_id
FROM class_session cs
WHERE css.class_session_id = cs.id
  AND css.tenant_id IS NULL;

ALTER TABLE attendance_record
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenant(id),
  ADD COLUMN IF NOT EXISTS payload_jsonb JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE attendance_record ar
SET tenant_id = cs.tenant_id
FROM class_session cs
WHERE ar.class_session_id = cs.id
  AND ar.tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_record_status_check'
  ) THEN
    ALTER TABLE attendance_record DROP CONSTRAINT attendance_record_status_check;
  END IF;
END $$;

ALTER TABLE attendance_record
  ADD CONSTRAINT attendance_record_status_check
  CHECK (status IN ('present','absent','late','excused','justified'));

CREATE TABLE IF NOT EXISTS attendance_sync_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  class_session_id UUID NOT NULL REFERENCES class_session(id) ON DELETE CASCADE,
  client_event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  error_summary TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_sync_event_unique
  ON attendance_sync_event(tenant_id, client_event_id);

CREATE TABLE IF NOT EXISTS audit_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload_jsonb JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_tenant_entity
  ON audit_event(tenant_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS tenant_api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
