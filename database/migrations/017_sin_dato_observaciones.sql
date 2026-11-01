-- ============================================================
-- SGICO: Migración 017 — "Sin dato" con observación obligatoria
-- ============================================================
--
-- OBJETIVO (ajustes de la reunión con el cliente):
--   - casos_comite.estadio_observaciones   : motivo cuando el paciente se
--     presenta sin estadificación (estadio_clinico = 'Sin estadificación').
--   - casos_comite.patologia_observaciones : motivo cuando no hay dato de
--     patología (patologia_realizada = NULL).
--
-- La fecha de diagnóstico desconocida no requiere columna: se registra con
-- el comodín de la CAC 1800-01-01 ("dato desconocido").
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS estadio_observaciones   text,
  ADD COLUMN IF NOT EXISTS patologia_observaciones text;

COMMENT ON COLUMN casos_comite.estadio_observaciones   IS 'Motivo por el que el caso se presenta sin estadificación.';
COMMENT ON COLUMN casos_comite.patologia_observaciones IS 'Motivo por el que no hay dato de patología.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='casos_comite' AND column_name='estadio_observaciones') THEN
    RAISE EXCEPTION 'Migración 017: falta casos_comite.estadio_observaciones';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='casos_comite' AND column_name='patologia_observaciones') THEN
    RAISE EXCEPTION 'Migración 017: falta casos_comite.patologia_observaciones';
  END IF;
END $$;

COMMIT;
