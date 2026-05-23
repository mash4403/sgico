-- ============================================================
-- SGICO: Migración 002 — Refinamientos de auditoría
-- ============================================================
--
-- ⚠️  ESTA MIGRACIÓN YA FUE APLICADA EN PRODUCCIÓN
--     (la BD actual la incluye, y la baseline 001 también).
--
--     Se conserva como REGISTRO HISTÓRICO de los cambios que
--     llevaron a la baseline. NO HACE FALTA RE-EJECUTARLA en
--     un entorno que ya aplicó 001_baseline_schema.sql.
--
--     Para un entorno vacío: aplicar SOLO la baseline 001 y
--     listo — esta migración ya está absorbida ahí.
--
-- ============================================================
--
-- Histórico — ¿Qué hacía esta migración?
--
-- Originalmente fue numerada 004_audit_refinements.sql.
-- Se aplicó sobre una BD que ya tenía:
--   - Una tabla casos_historial con función fn_log_caso_cambio()
--   - Política RLS de lectura para authenticated
--
-- Y agregó:
--   1. CHECK constraint en casos_historial.accion
--      (solo permite: crear | actualizar | eliminar)
--   2. Función fn_log_caso_cambio() mejorada:
--      - Snapshot inicial al INSERT (antes guardaba cambios=NULL)
--      - Whitelist limpia (sin cie10 que no existía)
--      - 60+ campos auditables incluyendo flujo de decisión completo
--   3. Políticas RLS de escritura bloqueadas con USING(false)
--      (evita falsificación de historial desde el cliente; el trigger
--       SECURITY DEFINER sí puede insertar)
--   4. Índice (caso_id, created_at DESC) — match exacto al patrón
--      de query del front
--   5. COMMENTs documentando tabla, columnas y función
--
-- Renombrada a 002 cuando se consolidó la baseline.
--
-- ============================================================

-- (Contenido original conservado abajo como referencia, comentado para
--  prevenir ejecución accidental. Si necesitas re-ejecutar manualmente
--  por algún motivo, descomenta y corre.)

/*

BEGIN;

ALTER TABLE casos_historial
  DROP CONSTRAINT IF EXISTS casos_historial_accion_check;

ALTER TABLE casos_historial
  ADD CONSTRAINT casos_historial_accion_check
  CHECK (accion IN ('crear', 'actualizar', 'eliminar'));

CREATE INDEX IF NOT EXISTS idx_historial_caso_fecha
  ON casos_historial (caso_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_log_caso_cambio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
-- [Cuerpo completo en la baseline 001 — ver tabla casos_historial]
$function$;

DROP POLICY IF EXISTS "Historial: nadie inserta directo"  ON casos_historial;
DROP POLICY IF EXISTS "Historial: nadie modifica directo" ON casos_historial;
DROP POLICY IF EXISTS "Historial: nadie elimina directo"  ON casos_historial;

CREATE POLICY "Historial: nadie inserta directo"
  ON casos_historial FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "Historial: nadie modifica directo"
  ON casos_historial FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Historial: nadie elimina directo"
  ON casos_historial FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE casos_historial IS
  'Log de auditoría de cambios sobre casos_comite. Inmutable desde el cliente.';

COMMIT;

*/
