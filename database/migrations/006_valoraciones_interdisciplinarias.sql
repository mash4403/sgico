-- ============================================================
-- SGICO: Migración 006 — Valoraciones interdisciplinarias
-- ============================================================
--
-- OBJETIVO: registrar de forma estructurada las valoraciones por
-- psicología, trabajo social y cuidados paliativos previas (o
-- durante) la presentación del caso al comité oncológico.
--
-- DECISIONES DE DISEÑO (acordadas con el usuario):
--   - Enfoque B: renombrar la columna huérfana `valoracion_psicosocial`
--     a `valorado_psicologia` (semánticamente más clara) y agregar
--     5 columnas nuevas.
--   - Cada disciplina tiene 2 campos: boolean (¿fue valorado?) + text
--     (concepto registrado). Esto permite "Sí, fue valorado, concepto:
--     'X' " vs "No, no se ha valorado" sin ambigüedad.
--
-- VERIFICACIÓN PREVIA:
--   - La columna vieja `valoracion_psicosocial` (boolean) existe pero
--     NO está siendo usada por el frontend (verificado con grep).
--   - Por lo tanto el rename es seguro.
--
-- LO QUE HACE:
--   1. Renombra valoracion_psicosocial → valorado_psicologia.
--   2. Agrega 5 columnas nuevas (3 boolean + 3 text, en realidad
--      2 boolean + 3 text, ver mapeo abajo).
--   3. Documenta cada columna con COMMENT.
--
-- LO QUE NO HACE:
--   - No agrega CHECK constraints (los booleans pueden ser NULL = "sin
--     valorar todavía").
--   - No actualiza ningún dato existente (la columna renombrada conserva
--     los valores actuales).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Verificación previa
-- ============================================================

DO $$
BEGIN
  -- Confirmar que valoracion_psicosocial existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casos_comite'
      AND column_name = 'valoracion_psicosocial'
  ) THEN
    RAISE EXCEPTION 'ABORT: la columna valoracion_psicosocial no existe en casos_comite';
  END IF;

  -- Confirmar que valorado_psicologia NO existe (sino el rename falla)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casos_comite'
      AND column_name = 'valorado_psicologia'
  ) THEN
    RAISE EXCEPTION 'ABORT: la columna valorado_psicologia ya existe. Migración ya aplicada o conflicto.';
  END IF;

  RAISE NOTICE 'OK: condiciones previas validadas';
END $$;

-- ============================================================
-- PASO 2 — Renombrar columna existente
-- ============================================================

ALTER TABLE casos_comite
  RENAME COLUMN valoracion_psicosocial TO valorado_psicologia;

-- ============================================================
-- PASO 3 — Agregar columnas nuevas (idempotente con IF NOT EXISTS)
-- ============================================================

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS concepto_psicologia TEXT,
  ADD COLUMN IF NOT EXISTS valorado_trabajo_social BOOLEAN,
  ADD COLUMN IF NOT EXISTS concepto_trabajo_social TEXT,
  ADD COLUMN IF NOT EXISTS valorado_paliativos BOOLEAN,
  ADD COLUMN IF NOT EXISTS concepto_paliativos TEXT;

-- ============================================================
-- PASO 4 — Comentarios de schema
-- ============================================================

COMMENT ON COLUMN casos_comite.valorado_psicologia
  IS 'TRUE si el paciente fue valorado por psicología antes/durante el comité. NULL = sin información.';

COMMENT ON COLUMN casos_comite.concepto_psicologia
  IS 'Concepto/observaciones de la valoración por psicología (texto libre).';

COMMENT ON COLUMN casos_comite.valorado_trabajo_social
  IS 'TRUE si el paciente fue valorado por trabajo social. NULL = sin información.';

COMMENT ON COLUMN casos_comite.concepto_trabajo_social
  IS 'Concepto/observaciones de la valoración por trabajo social.';

COMMENT ON COLUMN casos_comite.valorado_paliativos
  IS 'TRUE si el paciente fue valorado por cuidados paliativos. NULL = sin información.';

COMMENT ON COLUMN casos_comite.concepto_paliativos
  IS 'Concepto/observaciones del equipo de cuidados paliativos.';

-- ============================================================
-- PASO 5 — Verificación final
-- ============================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'casos_comite'
    AND column_name IN (
      'valorado_psicologia',
      'concepto_psicologia',
      'valorado_trabajo_social',
      'concepto_trabajo_social',
      'valorado_paliativos',
      'concepto_paliativos'
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 6 columnas, hay %', v_count;
  END IF;

  -- Confirmar que la vieja columna ya no existe (fue renombrada)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casos_comite'
      AND column_name = 'valoracion_psicosocial'
  ) THEN
    RAISE EXCEPTION 'ABORT: valoracion_psicosocial todavía existe (rename falló)';
  END IF;

  RAISE NOTICE '════════ MIGRACION 006 COMPLETADA ════════';
  RAISE NOTICE '  Columna renombrada: valoracion_psicosocial → valorado_psicologia';
  RAISE NOTICE '  Columnas nuevas: 5';
  RAISE NOTICE '  Total columnas de valoraciones: 6';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
-- SELECT column_name, data_type, is_nullable, col_description(
--   'public.casos_comite'::regclass,
--   ordinal_position
-- ) AS comentario
-- FROM information_schema.columns
-- WHERE table_name = 'casos_comite'
--   AND (column_name LIKE 'valorado_%' OR column_name LIKE 'concepto_%')
-- ORDER BY ordinal_position;
--
-- ============================================================
