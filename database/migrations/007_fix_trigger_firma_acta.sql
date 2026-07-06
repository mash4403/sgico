-- ============================================================
-- SGICO: Migración 007 — Arreglar sincronización al firmar acta
-- ============================================================
--
-- PROBLEMA DETECTADO:
--   El trigger tr_actas_sync_firmada (migración 005) solo dispara
--   en BEFORE UPDATE. Pero la app usa upsert: cuando el usuario firma
--   un acta SIN haber guardado borrador primero, el upsert ejecuta un
--   INSERT con firmada=true, que NO dispara el trigger de UPDATE.
--
--   Consecuencia: fecha_firma queda NULL y la decisión no se propaga
--   a casos_comite.decision. El caso sigue "pendiente" pese a estar
--   el acta firmada.
--
-- LO QUE HACE ESTA MIGRACIÓN:
--   1. Reescribe la función fn_sync_acta_firmada para:
--      - Cubrir INSERT y UPDATE (no solo UPDATE).
--      - Llenar fecha_firma si viene NULL al firmar.
--      - Llenar firmada_por con auth.uid() si viene NULL.
--      - Propagar decision_final a casos_comite.decision.
--      - Llenar casos_comite.fecha_presentacion con la fecha de firma
--        (si está NULL) — decisión acordada: firmar el acta ES presentar.
--   2. Recrea el trigger para que dispare en INSERT OR UPDATE.
--   3. Repara las actas ya firmadas que quedaron rotas (fecha_firma NULL).
--
-- LO QUE NO HACE:
--   - No cambia el schema de columnas.
--   - No toca actas no firmadas (borradores).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Verificación previa
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'actas_comite'
  ) THEN
    RAISE EXCEPTION 'ABORT: la tabla actas_comite no existe';
  END IF;

  RAISE NOTICE 'OK: actas_comite existe, procediendo';
END $$;

-- ============================================================
-- PASO 2 — Reescribir la función de sincronización
-- ============================================================
-- Ahora maneja tanto INSERT como UPDATE. Usa TG_OP para distinguir.

CREATE OR REPLACE FUNCTION fn_sync_acta_firmada()
RETURNS TRIGGER AS $$
DECLARE
  v_debe_sincronizar BOOLEAN := FALSE;
BEGIN
  -- Determinar si hay que sincronizar según la operación
  IF TG_OP = 'INSERT' THEN
    -- En INSERT: sincronizar si el acta nace firmada
    v_debe_sincronizar := (NEW.firmada = TRUE);
  ELSIF TG_OP = 'UPDATE' THEN
    -- En UPDATE: sincronizar si pasa de no-firmada a firmada
    v_debe_sincronizar := (NEW.firmada = TRUE
                           AND (OLD.firmada = FALSE OR OLD.firmada IS NULL));
  END IF;

  IF v_debe_sincronizar THEN

    -- 1. Llenar fecha_firma si viene vacía
    IF NEW.fecha_firma IS NULL THEN
      NEW.fecha_firma := now();
    END IF;

    -- 2. Llenar firmada_por con el usuario actual si viene vacío
    IF NEW.firmada_por IS NULL THEN
      NEW.firmada_por := auth.uid();
    END IF;

    -- 3. Propagar decisión al caso + llenar fecha_presentacion
    IF NEW.decision_final IS NOT NULL THEN
      UPDATE casos_comite
      SET decision = NEW.decision_final,
          fecha_presentacion = COALESCE(fecha_presentacion, NEW.fecha_firma::date),
          updated_at = now()
      WHERE id = NEW.caso_id;
    ELSE
      -- Aunque no haya decision_final, registrar la presentación
      UPDATE casos_comite
      SET fecha_presentacion = COALESCE(fecha_presentacion, NEW.fecha_firma::date),
          updated_at = now()
      WHERE id = NEW.caso_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PASO 3 — Recrear el trigger para INSERT OR UPDATE
-- ============================================================

DROP TRIGGER IF EXISTS tr_actas_sync_firmada ON actas_comite;

CREATE TRIGGER tr_actas_sync_firmada
  BEFORE INSERT OR UPDATE ON actas_comite
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_acta_firmada();

-- ============================================================
-- PASO 4 — Reparar actas ya firmadas que quedaron rotas
-- ============================================================
-- Estas son las actas con firmada=true pero fecha_firma NULL
-- (creadas antes de esta corrección). Les llenamos fecha_firma
-- con su created_at (mejor aproximación disponible) y propagamos
-- la decisión + fecha_presentacion a sus casos.

DO $$
DECLARE
  r RECORD;
  v_reparadas INT := 0;
BEGIN
  FOR r IN
    SELECT id, caso_id, decision_final, created_at, fecha_firma
    FROM actas_comite
    WHERE firmada = TRUE AND fecha_firma IS NULL
  LOOP
    -- Llenar fecha_firma del acta con su created_at
    UPDATE actas_comite
    SET fecha_firma = r.created_at
    WHERE id = r.id;

    -- Propagar al caso: decisión (si hay) + fecha_presentacion
    IF r.decision_final IS NOT NULL THEN
      UPDATE casos_comite
      SET decision = r.decision_final,
          fecha_presentacion = COALESCE(fecha_presentacion, r.created_at::date),
          updated_at = now()
      WHERE id = r.caso_id;
    ELSE
      UPDATE casos_comite
      SET fecha_presentacion = COALESCE(fecha_presentacion, r.created_at::date),
          updated_at = now()
      WHERE id = r.caso_id;
    END IF;

    v_reparadas := v_reparadas + 1;
  END LOOP;

  RAISE NOTICE 'Actas reparadas: %', v_reparadas;
END $$;

-- ============================================================
-- PASO 5 — Verificación final
-- ============================================================

DO $$
DECLARE
  v_rotas INT;
BEGIN
  -- No deben quedar actas firmadas con fecha_firma NULL
  SELECT COUNT(*) INTO v_rotas
  FROM actas_comite
  WHERE firmada = TRUE AND fecha_firma IS NULL;

  IF v_rotas > 0 THEN
    RAISE EXCEPTION 'ABORT: quedan % actas firmadas sin fecha_firma', v_rotas;
  END IF;

  RAISE NOTICE '════════ MIGRACION 007 COMPLETADA ════════';
  RAISE NOTICE '  Trigger ahora cubre INSERT + UPDATE';
  RAISE NOTICE '  fecha_presentacion se llena al firmar';
  RAISE NOTICE '  Actas firmadas sin fecha_firma restantes: %', v_rotas;
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
-- SELECT a.id AS acta_id, a.caso_id, a.firmada, a.fecha_firma,
--        a.decision_final, c.decision AS decision_caso,
--        c.fecha_presentacion
-- FROM actas_comite a
-- JOIN casos_comite c ON c.id = a.caso_id
-- ORDER BY a.id DESC;
--
-- Esperado: las 3 actas (caso 4, 6, 7) ahora con:
--   fecha_firma NO NULL, decision_caso = 'aprobado',
--   fecha_presentacion NO NULL.
-- ============================================================
