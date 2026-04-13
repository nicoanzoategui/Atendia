-- 008_create_qr_token.sql
CREATE TABLE IF NOT EXISTS qr_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id UUID REFERENCES class_session(id) ON DELETE CASCADE,
  token TEXT NOT NULL, -- The base64 signed token
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
