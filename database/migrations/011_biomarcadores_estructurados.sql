-- ============================================================
-- SGICO: Migración 011 — Biomarcadores estructurados (E3)
-- ============================================================
--
-- OBJETIVO: registrar biomarcadores como datos estructurados (selección),
-- no texto libre. Cada biomarcador = { biomarcador, resultado, fecha }, con
-- múltiples registros por caso.
--
-- DECISIÓN DE DISEÑO:
--   - Se guarda un arreglo jsonb en casos_comite.biomarcadores_estructurados.
--   - Se conserva la columna de texto `biomarcadores`, que el formulario
--     rellena con un RESUMEN derivado del arreglo, para que CasoDetalle y
--     MesaComite (que leen texto) sigan mostrando el dato sin cambios.
--
-- LO QUE HACE:
--   1. Agrega casos_comite.biomarcadores_estructurados (jsonb).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS biomarcadores_estructurados jsonb;

COMMENT ON COLUMN casos_comite.biomarcadores_estructurados
  IS 'Arreglo de biomarcadores { biomarcador, resultado, fecha }. La columna de texto biomarcadores guarda un resumen derivado para compatibilidad.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='casos_comite'
      AND column_name='biomarcadores_estructurados'
  ) THEN
    RAISE EXCEPTION 'ABORT: no se creó biomarcadores_estructurados';
  END IF;
  RAISE NOTICE '════════ MIGRACION 011 COMPLETADA ════════';
  RAISE NOTICE '  casos_comite.biomarcadores_estructurados (jsonb)';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;
