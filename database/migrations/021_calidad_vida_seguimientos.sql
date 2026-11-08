-- ============================================================
-- SGICO: Migración 021 — Calidad de vida en los seguimientos
-- ============================================================
--
-- OBJETIVO: medir el impacto de la decisión del comité en la calidad de
-- vida del paciente, comparando su capacidad funcional (ECOG) y su dolor
-- (EVA) al llegar al comité con los de cada control.
--
-- DECISIÓN (acordada con el cliente): solo ECOG y EVA, las mismas escalas
-- que ya se registran al presentar el caso (casos_comite.ecog / eva).
-- Las escalas de calidad de vida (EQ-5D, EORTC…) quedan para un capítulo
-- opcional posterior.
--
--   - seguimientos.ecog: 0–4 (estado funcional en el control)
--   - seguimientos.eva:  0–10 (dolor en el control)
--
-- No modifica datos existentes: los controles anteriores quedan sin dato.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS ecog smallint;
ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS eva  smallint;

ALTER TABLE seguimientos DROP CONSTRAINT IF EXISTS seguimientos_ecog_check;
ALTER TABLE seguimientos ADD CONSTRAINT seguimientos_ecog_check CHECK (ecog IS NULL OR (ecog >= 0 AND ecog <= 4));
ALTER TABLE seguimientos DROP CONSTRAINT IF EXISTS seguimientos_eva_check;
ALTER TABLE seguimientos ADD CONSTRAINT seguimientos_eva_check CHECK (eva IS NULL OR (eva >= 0 AND eva <= 10));

COMMENT ON COLUMN seguimientos.ecog IS 'ECOG en el control (0–4). Se compara con casos_comite.ecog (al ingreso) para el indicador de calidad de vida.';
COMMENT ON COLUMN seguimientos.eva  IS 'Dolor EVA en el control (0–10). Se compara con casos_comite.eva (al ingreso) para el indicador de calidad de vida.';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'seguimientos'
         AND column_name IN ('ecog', 'eva')) <> 2 THEN
    RAISE EXCEPTION 'Migración 021: faltan seguimientos.ecog / seguimientos.eva';
  END IF;
  RAISE NOTICE 'Migración 021 OK: seguimientos.ecog y seguimientos.eva';
END $$;

COMMIT;
