-- 012_fix_rls_policies.sql
-- Replace the broken USING(true) policies with real tenant isolation.
-- The backend uses the service_role key (bypasses RLS), so these policies
-- protect against direct client-side access only.

-- Drop the broken policies from 009
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant;
DROP POLICY IF EXISTS attendance_record_policy ON attendance_record;

-- Also drop and recreate the ones that used a subquery (which don't truly isolate)
DROP POLICY IF EXISTS user_tenant_policy ON app_user;
DROP POLICY IF EXISTS learning_proposal_tenant_policy ON learning_proposal;
DROP POLICY IF EXISTS learning_proposal_edition_tenant_policy ON learning_proposal_edition;
DROP POLICY IF EXISTS class_session_tenant_policy ON class_session;

-- ── tenant ────────────────────────────────────────────────────────────────
-- No direct client access to the tenant table; backend only.
CREATE POLICY tenant_read_own ON tenant
  FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── app_user ──────────────────────────────────────────────────────────────
CREATE POLICY user_read_own_tenant ON app_user
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY user_read_self ON app_user
  FOR SELECT
  USING (id = (auth.jwt() ->> 'sub')::uuid);

-- ── learning_proposal ─────────────────────────────────────────────────────
CREATE POLICY lp_read_own_tenant ON learning_proposal
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── learning_proposal_edition ─────────────────────────────────────────────
CREATE POLICY lpe_read_own_tenant ON learning_proposal_edition
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── class_session ─────────────────────────────────────────────────────────
CREATE POLICY session_read_own_tenant ON class_session
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── attendance_record ─────────────────────────────────────────────────────
-- Teachers can see all records in their tenant's sessions.
-- Students can only see their own records.
CREATE POLICY attendance_teacher_read ON attendance_record
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'teacher'
    AND class_session_id IN (
      SELECT id FROM class_session
      WHERE tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
  );

CREATE POLICY attendance_student_read_own ON attendance_record
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'student'
    AND student_external_id = (auth.jwt() ->> 'external_id')
  );

-- Students cannot insert/update directly — all writes go through the backend
CREATE POLICY attendance_no_direct_write ON attendance_record
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY attendance_no_direct_update ON attendance_record
  FOR UPDATE
  USING (false);
