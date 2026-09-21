-- ============================================================
-- SGICO: Migración 014 — Capacidad funcional + patología/IHQ estructuradas
-- ============================================================
--
-- OBJETIVO (reorganización del formulario de presentación):
--   1. "Capacidad funcional" pasa a ser su propio paso: ECOG (ya existía),
--      EVA (dolor 0–10) y una nota de estado físico actual. El ECOG deja de
--      vivir en "Antecedentes".
--   2. La patología y la inmunohistoquímica pasan a "Diagnóstico" con un
--      "sí/no" explícito: si NO hubo patología, no se exige histología ni
--      descripción; la IHQ es su propio campo con descripción independiente.
--   3. El estudio molecular / NGS también se considera diagnóstico (ya tenía
--      columnas estudios_moleculares / fecha_moleculares — no cambian aquí).
--
-- DECISIONES DE DISEÑO:
--   - eva: smallint 0..10 (CHECK). NULL = sin registrar.
--   - patologia_realizada / inmunohistoquimica_realizada: boolean (NULL = sin
--     responder). Cuando patologia_realizada = false, la UI limpia histología
--     y descripción de patología (quedan NULL en la fila presentada).
--   - inmunohistoquimica: text con la descripción de la IHQ (antes iba mezclada
--     dentro de estudios_patologia).
--
-- LO QUE NO HACE:
--   - No migra el texto IHQ que ya viviera dentro de estudios_patologia (los
--     casos previos conservan su texto tal cual; solo aplica a casos nuevos).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Columnas nuevas
-- ============================================================

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS eva                          smallint,
  ADD COLUMN IF NOT EXISTS estado_fisico                text,
  ADD COLUMN IF NOT EXISTS patologia_realizada          boolean,
  ADD COLUMN IF NOT EXISTS inmunohistoquimica_realizada boolean,
  ADD COLUMN IF NOT EXISTS inmunohistoquimica           text;

-- ============================================================
-- PASO 2 — CHECK del rango de EVA (idempotente)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casos_comite_eva_chk') THEN
    ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_eva_chk
      CHECK (eva IS NULL OR (eva >= 0 AND eva <= 10));
  END IF;
END $$;

COMMENT ON COLUMN casos_comite.eva                          IS 'Escala visual analógica del dolor (0–10). NULL = sin registrar.';
COMMENT ON COLUMN casos_comite.estado_fisico                IS 'Datos relevantes del estado físico actual (capacidad funcional).';
COMMENT ON COLUMN casos_comite.patologia_realizada          IS 'Si se realizó estudio de patología. Cuando es false, histologia/estudios_patologia quedan NULL.';
COMMENT ON COLUMN casos_comite.inmunohistoquimica_realizada IS 'Si se realizó inmunohistoquímica.';
COMMENT ON COLUMN casos_comite.inmunohistoquimica           IS 'Descripción de la inmunohistoquímica (independiente de estudios_patologia).';

-- ============================================================
-- PASO 3 — Verificación
-- ============================================================

DO $$
DECLARE v int;
BEGIN
  SELECT COUNT(*) INTO v FROM information_schema.columns
   WHERE table_schema='public' AND table_name='casos_comite'
     AND column_name IN ('eva','estado_fisico','patologia_realizada','inmunohistoquimica_realizada','inmunohistoquimica');
  IF v <> 5 THEN RAISE EXCEPTION 'ABORT: faltan columnas (hay %)', v; END IF;
  RAISE NOTICE '════════ MIGRACION 014 COMPLETADA ════════';
  RAISE NOTICE '  eva (0-10, +CHECK) / estado_fisico';
  RAISE NOTICE '  patologia_realizada / inmunohistoquimica_realizada / inmunohistoquimica';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;
