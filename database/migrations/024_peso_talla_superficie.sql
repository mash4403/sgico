-- ============================================================
-- SGICO: Migración 024 — Peso, talla y superficie corporal
-- ============================================================
--
-- El formulario de presentación pide peso y talla en «Capacidad funcional»
-- y calcula la superficie corporal (Mosteller: √(talla cm × peso kg / 3600)).
-- Se guardan los tres valores del momento en que se presenta el caso; la
-- superficie queda registrada tal como se mostró al comité.
--
-- Los casos anteriores quedan con los campos vacíos («sin registro»).
--
-- Ejecutar en: Supabase SQL Editor, ANTES de publicar el código que la usa
-- ============================================================

BEGIN;

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS peso_kg             numeric(5,1),
  ADD COLUMN IF NOT EXISTS talla_cm            numeric(5,1),
  ADD COLUMN IF NOT EXISTS superficie_corporal numeric(4,2);

ALTER TABLE casos_comite DROP CONSTRAINT IF EXISTS casos_comite_peso_kg_check;
ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_peso_kg_check
  CHECK (peso_kg IS NULL OR peso_kg BETWEEN 1 AND 400);
ALTER TABLE casos_comite DROP CONSTRAINT IF EXISTS casos_comite_talla_cm_check;
ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_talla_cm_check
  CHECK (talla_cm IS NULL OR talla_cm BETWEEN 30 AND 250);
ALTER TABLE casos_comite DROP CONSTRAINT IF EXISTS casos_comite_superficie_corporal_check;
ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_superficie_corporal_check
  CHECK (superficie_corporal IS NULL OR superficie_corporal BETWEEN 0.1 AND 4);

COMMENT ON COLUMN casos_comite.peso_kg             IS 'Peso del paciente al presentar el caso (kg).';
COMMENT ON COLUMN casos_comite.talla_cm            IS 'Talla del paciente al presentar el caso (cm).';
COMMENT ON COLUMN casos_comite.superficie_corporal IS 'Superficie corporal (m²), Mosteller: √(talla cm × peso kg / 3600), calculada en el formulario.';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'casos_comite'
         AND column_name IN ('peso_kg', 'talla_cm', 'superficie_corporal')) <> 3 THEN
    RAISE EXCEPTION 'Migración 024: faltan columnas en casos_comite';
  END IF;
  RAISE NOTICE 'Migración 024 OK: casos_comite.peso_kg, talla_cm, superficie_corporal';
END $$;

COMMIT;
