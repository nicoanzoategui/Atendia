-- 002_create_users.sql
CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT, -- ID del campus/panel externo
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- For custom auth if needed, though Supabase Auth is preferred
  role TEXT NOT NULL CHECK (role IN ('teacher','student','admin_tenant','admin_app')),
  tenant_id UUID REFERENCES tenant(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
