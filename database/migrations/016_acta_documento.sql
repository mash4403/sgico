-- ============================================================
-- SGICO: Migración 016 — Campos para el acta formateada
-- ============================================================
--
-- OBJETIVO: soportar el acta institucional (documento formateado):
--   - participantes_comite.registro : registro médico / profesional (RM/RE)
--     que se muestra en la tabla de firmas.
--   - actas_comite.observaciones    : sección de observaciones del acta.
--
-- (Los demás datos del acta se derivan de lo ya existente: caso, paciente,
--  sesión, biomarcadores, decisión y participantes/firmas.)
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE participantes_comite
  ADD COLUMN IF NOT EXISTS registro text;

ALTER TABLE actas_comite
  ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN participantes_comite.registro IS 'Registro médico/profesional (RM/RE) mostrado en la tabla de firmas del acta.';
COMMENT ON COLUMN actas_comite.observaciones     IS 'Observaciones del acta (sección 10 del documento formateado).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='participantes_comite' AND column_name='registro') THEN
    RAISE EXCEPTION 'ABORT: falta participantes_comite.registro';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='actas_comite' AND column_name='observaciones') THEN
    RAISE EXCEPTION 'ABORT: falta actas_comite.observaciones';
  END IF;
  RAISE NOTICE '════════ MIGRACION 016 COMPLETADA ════════';
  RAISE NOTICE '  participantes_comite.registro';
  RAISE NOTICE '  actas_comite.observaciones';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;
