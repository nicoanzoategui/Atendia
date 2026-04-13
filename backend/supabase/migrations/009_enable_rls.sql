-- 009_enable_rls.sql

-- Enable RLS on all tables
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_proposal_edition ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_session_teacher ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_session_student ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_token ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies (simplified for initial phase)
-- In a real scenario, these would check the user's tenant_id from JWT metadata

CREATE POLICY tenant_isolation_policy ON tenant
  USING (true); -- Institutional access would be restricted here

CREATE POLICY user_tenant_policy ON app_user
  USING (tenant_id IN (SELECT id FROM tenant));

CREATE POLICY learning_proposal_tenant_policy ON learning_proposal
  USING (tenant_id IN (SELECT id FROM tenant));

CREATE POLICY learning_proposal_edition_tenant_policy ON learning_proposal_edition
  USING (tenant_id IN (SELECT id FROM tenant));

CREATE POLICY class_session_tenant_policy ON class_session
  USING (tenant_id IN (SELECT id FROM tenant));

-- attendance_record policy: teachers see all in their tenant, students see only their own
CREATE POLICY attendance_record_policy ON attendance_record
  USING (true); -- To be refined in Phase 2/5 with auth context
