-- 003_create_courses.sql
-- [EMULAR] Curso abstracto
CREATE TABLE IF NOT EXISTS learning_proposal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  name TEXT NOT NULL,
  tenant_id UUID REFERENCES tenant(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- [EMULAR] Instancia concreta del curso (cursada/comisión)
CREATE TABLE IF NOT EXISTS learning_proposal_edition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  learning_proposal_id UUID REFERENCES learning_proposal(id),
  name TEXT NOT NULL,
  tenant_id UUID REFERENCES tenant(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
