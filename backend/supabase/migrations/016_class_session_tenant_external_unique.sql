-- PostgREST / supabase-js upsert usa ON CONFLICT (tenant_id, external_id).
-- Un índice único PARCIAL (WHERE external_id IS NOT NULL) no coincide con esa
-- inferencia y provoca: "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification".
--
-- UNIQUE (tenant_id, external_id) en PostgreSQL sigue permitiendo varias filas
-- con external_id NULL (NULL se considera distinto en comparaciones de unicidad).

DROP INDEX IF EXISTS idx_class_session_tenant_external_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM class_session
    WHERE external_id IS NOT NULL
    GROUP BY tenant_id, external_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 016: hay filas duplicadas (tenant_id, external_id). Eliminá o unificá duplicados antes de continuar.';
  END IF;
END $$;

ALTER TABLE class_session
  DROP CONSTRAINT IF EXISTS class_session_tenant_external_uidx;

ALTER TABLE class_session
  ADD CONSTRAINT class_session_tenant_external_uidx UNIQUE (tenant_id, external_id);
