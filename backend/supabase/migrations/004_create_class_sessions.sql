-- 004_create_class_sessions.sql
CREATE TABLE IF NOT EXISTS class_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_class_session_id TEXT,
  learning_proposal_id UUID REFERENCES learning_proposal(id),
  learning_proposal_edition_id UUID REFERENCES learning_proposal_edition(id),
  tenant_id UUID REFERENCES tenant(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  classroom TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','open','closed','synced')) DEFAULT 'draft',
  sync_version INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
