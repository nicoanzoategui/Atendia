-- Registro de listas PDF (ID único por sesión) para evitar reprocesar la misma hoja OCR.
CREATE TABLE IF NOT EXISTS attendance_sheet_processed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  class_session_id UUID NOT NULL REFERENCES class_session(id) ON DELETE CASCADE,
  list_id UUID NOT NULL,
  recorded_by_actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_session_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_sheet_processed_session ON attendance_sheet_processed (class_session_id);
