-- 010_create_indexes.sql
CREATE INDEX IF NOT EXISTS idx_app_user_tenant_id ON app_user(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_proposal_tenant_id ON learning_proposal(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_proposal_edition_tenant_id ON learning_proposal_edition(tenant_id);
CREATE INDEX IF NOT EXISTS idx_class_session_tenant_id ON class_session(tenant_id);
CREATE INDEX IF NOT EXISTS idx_class_session_date ON class_session(date);
CREATE INDEX IF NOT EXISTS idx_attendance_record_session_student ON attendance_record(class_session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_qr_token_session_expires ON qr_token(class_session_id, expires_at);
