-- ============================================================
-- SGICO: Migración 022 — Duración del tratamiento en protocolos
-- ============================================================
--
-- PROBLEMA: la proyección de costos multiplicaba siempre el costo por
--   ciclo por los ciclos que caben en el PFS. Los esquemas de duración
--   fija (adyuvancia, neoadyuvancia, consolidación: abemaciclib 2 años,
--   pembrolizumab adyuvante 17 ciclos, T-DM1 14 ciclos…) no dependen del
--   PFS, y las inmunoterapias metastásicas tienen un tope (35 ciclos).
--
-- SOLUCIÓN: el protocolo indica cómo se calcula su duración.
--   - tipo_duracion:  'hasta_progresion' (por defecto) | 'fija' | 'tope'
--   - ciclos_esquema: ciclos del esquema (fija) o máximo de ciclos (tope)
--   - dias_ciclo:     duración del ciclo en días (autocompleta el formulario)
--
-- La duración elegida en cada caso se guarda dentro de
-- casos_comite.proyeccion_costos (jsonb): no requiere columnas en casos.
-- Los casos existentes no cambian.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE protocolos
  ADD COLUMN IF NOT EXISTS tipo_duracion  varchar(20) NOT NULL DEFAULT 'hasta_progresion',
  ADD COLUMN IF NOT EXISTS ciclos_esquema smallint,
  ADD COLUMN IF NOT EXISTS dias_ciclo     smallint;

ALTER TABLE protocolos DROP CONSTRAINT IF EXISTS protocolos_tipo_duracion_check;
ALTER TABLE protocolos ADD CONSTRAINT protocolos_tipo_duracion_check CHECK (
  tipo_duracion IN ('hasta_progresion', 'fija', 'tope')
  AND (tipo_duracion = 'hasta_progresion' OR (ciclos_esquema IS NOT NULL AND ciclos_esquema > 0))
);
ALTER TABLE protocolos DROP CONSTRAINT IF EXISTS protocolos_dias_ciclo_check;
ALTER TABLE protocolos ADD CONSTRAINT protocolos_dias_ciclo_check CHECK (dias_ciclo IS NULL OR dias_ciclo > 0);

COMMENT ON COLUMN protocolos.tipo_duracion  IS 'Cómo se calcula la duración para costos: hasta_progresion (PFS), fija (ciclos del esquema) o tope (PFS con máximo de ciclos).';
COMMENT ON COLUMN protocolos.ciclos_esquema IS 'Ciclos del esquema (fija) o máximo de ciclos (tope).';
COMMENT ON COLUMN protocolos.dias_ciclo     IS 'Duración del ciclo en días; autocompleta el formulario de presentación.';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'protocolos'
         AND column_name IN ('tipo_duracion', 'ciclos_esquema', 'dias_ciclo')) <> 3 THEN
    RAISE EXCEPTION 'Migración 022: faltan columnas en protocolos';
  END IF;
  RAISE NOTICE 'Migración 022 OK: protocolos.tipo_duracion, ciclos_esquema, dias_ciclo';
END $$;

COMMIT;
