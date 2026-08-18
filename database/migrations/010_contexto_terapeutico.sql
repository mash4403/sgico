-- ============================================================
-- SGICO: Migración 010 — Contexto terapéutico + fechas de paraclínicos
-- ============================================================
--
-- OBJETIVO (Sprint E1 + E2):
--   E1 — Reemplazar la "línea actual" numérica por un contexto terapéutico
--        clínico estructurado. Neoadyuvancia/adyuvancia NO son líneas
--        metastásicas; las líneas 1/2/3+ se refieren a enfermedad metastásica.
--   E2 — Fechas propias para patología y estudios moleculares (la
--        "fecha de último estudio" global se retira de la UI).
--
-- DECISIONES DE DISEÑO (acordadas con el usuario):
--   - Enum de contexto (mismo para el tratamiento actual y para la propuesta):
--       naive · neoadyuvancia · adyuvancia · metastasica_1 · metastasica_2 ·
--       metastasica_3 · metastasica_posterior
--   - Se conserva linea_actual (integer) por compatibilidad; se rellena por
--     derivación desde el contexto. La detección de "naive" pasa a basarse en
--     contexto_actual = 'naive'.
--
-- LO QUE HACE:
--   1. Agrega contexto_actual, contexto_propuesto (varchar + CHECK).
--   2. Agrega fecha_patologia, fecha_moleculares (date).
--   3. Backfill best-effort de contexto_actual desde linea_actual.
--
-- LO QUE NO HACE:
--   - No elimina fecha_ultimo_estudio ni linea_actual (solo salen de la UI).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Columnas nuevas
-- ============================================================

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS contexto_actual    varchar,
  ADD COLUMN IF NOT EXISTS contexto_propuesto varchar,
  ADD COLUMN IF NOT EXISTS fecha_patologia    date,
  ADD COLUMN IF NOT EXISTS fecha_moleculares  date;

-- ============================================================
-- PASO 2 — CHECK del enum de contexto (idempotente)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casos_comite_contexto_actual_chk') THEN
    ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_contexto_actual_chk
      CHECK (contexto_actual IS NULL OR contexto_actual IN
        ('naive','neoadyuvancia','adyuvancia','metastasica_1','metastasica_2','metastasica_3','metastasica_posterior'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casos_comite_contexto_propuesto_chk') THEN
    ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_contexto_propuesto_chk
      CHECK (contexto_propuesto IS NULL OR contexto_propuesto IN
        ('naive','neoadyuvancia','adyuvancia','metastasica_1','metastasica_2','metastasica_3','metastasica_posterior'));
  END IF;
END $$;

COMMENT ON COLUMN casos_comite.contexto_actual    IS 'Contexto terapéutico actual: naive/neoadyuvancia/adyuvancia/metastasica_1..3/metastasica_posterior.';
COMMENT ON COLUMN casos_comite.contexto_propuesto IS 'Contexto terapéutico de la propuesta (mismo enum).';
COMMENT ON COLUMN casos_comite.fecha_patologia    IS 'Fecha del estudio de patología.';
COMMENT ON COLUMN casos_comite.fecha_moleculares  IS 'Fecha del estudio molecular / NGS.';

-- ============================================================
-- PASO 3 — Backfill best-effort desde linea_actual
-- ============================================================
-- (neoadyuvancia/adyuvancia no son derivables del número → quedan NULL)

ALTER TABLE casos_comite DISABLE TRIGGER USER;
UPDATE casos_comite SET contexto_actual = CASE
    WHEN linea_actual = 0 THEN 'naive'
    WHEN linea_actual = 1 THEN 'metastasica_1'
    WHEN linea_actual = 2 THEN 'metastasica_2'
    WHEN linea_actual = 3 THEN 'metastasica_3'
    WHEN linea_actual >= 4 THEN 'metastasica_posterior'
    ELSE NULL END
  WHERE contexto_actual IS NULL AND linea_actual IS NOT NULL;
ALTER TABLE casos_comite ENABLE TRIGGER USER;

-- ============================================================
-- PASO 4 — Verificación
-- ============================================================

DO $$
DECLARE v int;
BEGIN
  SELECT COUNT(*) INTO v FROM information_schema.columns
   WHERE table_schema='public' AND table_name='casos_comite'
     AND column_name IN ('contexto_actual','contexto_propuesto','fecha_patologia','fecha_moleculares');
  IF v <> 4 THEN RAISE EXCEPTION 'ABORT: faltan columnas (hay %)', v; END IF;
  RAISE NOTICE '════════ MIGRACION 010 COMPLETADA ════════';
  RAISE NOTICE '  contexto_actual / contexto_propuesto (+ CHECK)';
  RAISE NOTICE '  fecha_patologia / fecha_moleculares';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;
