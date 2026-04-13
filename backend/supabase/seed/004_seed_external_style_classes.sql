-- Mock data aligned with the future external classes contract.
-- This keeps the app testable while the real external API is not available yet.

UPDATE class_session
SET
  external_id = COALESCE(external_id, 'EXT-' || substring(id::text, 1, 8)),
  name = COALESCE(NULLIF(name, ''), 'Clase presencial'),
  subject = COALESCE(NULLIF(subject, ''), learning_proposal_edition_id::text),
  modality = COALESCE(modality, 'in_person'),
  location_campus = COALESCE(location_campus, 'Av. Medrano 444'),
  location_building = COALESCE(location_building, 'Edificio Central'),
  location_classroom = COALESCE(location_classroom, classroom, 'Aula 101'),
  location_floor = COALESCE(location_floor, '1'),
  metadata_jsonb = COALESCE(metadata_jsonb, '{}'::jsonb),
  updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

UPDATE class_session
SET
  name = 'Instalacion de aire acondicionado',
  subject = 'Aire acondicionado',
  external_id = COALESCE(external_id, 'SOFIA-AIR-26A-' || substring(id::text, 1, 4)),
  location_campus = COALESCE(location_campus, 'Av. Medrano 444'),
  location_building = COALESCE(location_building, 'Sede Principal'),
  location_classroom = COALESCE(location_classroom, classroom, 'Aula 201'),
  modality = 'in_person',
  updated_at = NOW()
WHERE learning_proposal_edition_id = '40000000-0000-0000-0000-000000000001';

UPDATE class_session_student css
SET
  tenant_id = COALESCE(css.tenant_id, '00000000-0000-0000-0000-000000000001'),
  student_name = COALESCE(
    css.student_name,
    initcap(replace(split_part(au.email, '@', 1), '.', ' '))
  ),
  updated_at = NOW()
FROM app_user au
WHERE au.id = css.student_id
  AND css.tenant_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'
   OR css.student_name IS NULL;

INSERT INTO tenant_api_key (tenant_id, name, api_key)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'mock-external-client',
  'tenant-demo-key-123'
)
ON CONFLICT (api_key) DO NOTHING;
