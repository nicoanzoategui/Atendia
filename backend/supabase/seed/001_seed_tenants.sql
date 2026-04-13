-- 001_seed_tenants.sql
INSERT INTO tenant (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Centro de Estudios Demo', 'demo-center')
ON CONFLICT (id) DO NOTHING;
