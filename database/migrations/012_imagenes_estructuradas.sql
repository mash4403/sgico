-- ============================================================
-- SGICO: Migración 012 — Imágenes diagnósticas estructuradas (E4)
-- ============================================================
--
-- OBJETIVO: registrar las imágenes diagnósticas como selección específica
-- (denominaciones tipo CUPS: "TAC de tórax", "RM lumbar"…), cada una con su
-- fecha y hallazgo, en múltiples registros por caso — en vez de texto libre.
--
-- DECISIÓN DE DISEÑO (igual que biomarcadores E3):
--   - Arreglo jsonb en casos_comite.imagenes_estructuradas
--     ({ estudio, fecha, hallazgo }).
--   - La columna de texto estudios_imagenes se rellena con un RESUMEN derivado,
--     para que CasoDetalle/MesaComite sigan mostrando el dato sin cambios.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS imagenes_estructuradas jsonb;

COMMENT ON COLUMN casos_comite.imagenes_estructuradas
  IS 'Arreglo de imágenes { estudio, fecha, hallazgo }. estudios_imagenes (texto) guarda un resumen derivado para compatibilidad.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='casos_comite'
      AND column_name='imagenes_estructuradas'
  ) THEN
    RAISE EXCEPTION 'ABORT: no se creó imagenes_estructuradas';
  END IF;
  RAISE NOTICE '════════ MIGRACION 012 COMPLETADA ════════';
  RAISE NOTICE '  casos_comite.imagenes_estructuradas (jsonb)';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;
