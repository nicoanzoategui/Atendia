-- 002_seed_users.sql
-- Password for all users: password123
-- Hash generated with: bcrypt(password123, rounds=10)
INSERT INTO app_user (id, external_id, email, password_hash, role, tenant_id)
VALUES
  -- Docentes
  ('10000000-0000-0000-0000-000000000001', 'T-001', 'teacher1@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'teacher', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'T-002', 'teacher2@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'teacher', '00000000-0000-0000-0000-000000000001'),
  -- Alumnos (10 total)
  ('20000000-0000-0000-0000-000000000001', 'S-001', 'student1@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'S-002', 'student2@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', 'S-003', 'student3@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000004', 'S-004', 'student4@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000005', 'S-005', 'student5@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000006', 'S-006', 'student6@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000007', 'S-007', 'student7@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000008', 'S-008', 'student8@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000009', 'S-009', 'student9@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000010', 'S-010', 'student10@demo.com', '$2b$10$jNbxVo04AuecopN3c0mdSex/xcd6KIdzzOZXOFDB1vuqVsw3w0tHG', 'student', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (email) DO NOTHING;
