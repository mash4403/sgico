-- ============================================================
-- SGICO: Migración 003 — Cleanup de datos de prueba (v2)
-- ============================================================
--
-- v2 — Corrige el error de FK del trigger trg_caso_historial al borrar
--      casos_comite. Solución: deshabilitamos el trigger durante el
--      DELETE y lo re-habilitamos al final.
--
-- OBJETIVO: dejar la BD limpia para producción con Valle/Tolima/Cauca.
--
-- LO QUE HACE:
--   1. Borra TODO el dominio clínico ficticio
--   2. Conserva catálogos: eps, gestores, protocolos
--   3. Borra las 6 sedes viejas
--   4. Renumera Valle/Tolima/Cauca a IDs 1/2/3
--   5. Resetea secuencias del dominio clínico
--
-- LO QUE NO TOCA:
--   - eps, gestores, protocolos
--   - schema (tablas, índices, triggers, funciones)
--   - usuarios de auth.users
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 0 — Inventario inicial
-- ============================================================

DO $$
DECLARE
  v_pacientes        INT;
  v_medicos          INT;
  v_casos            INT;
  v_seguimientos     INT;
  v_sedes_activas    INT;
  v_sedes_total      INT;
BEGIN
  SELECT COUNT(*) INTO v_pacientes     FROM pacientes;
  SELECT COUNT(*) INTO v_medicos       FROM medicos;
  SELECT COUNT(*) INTO v_casos         FROM casos_comite;
  SELECT COUNT(*) INTO v_seguimientos  FROM seguimientos;
  SELECT COUNT(*) INTO v_sedes_total   FROM sedes;
  SELECT COUNT(*) INTO v_sedes_activas FROM sedes WHERE activa = TRUE;

  RAISE NOTICE '════════ INVENTARIO ANTES DEL CLEANUP ════════';
  RAISE NOTICE 'Pacientes:    %', v_pacientes;
  RAISE NOTICE 'Médicos:      %', v_medicos;
  RAISE NOTICE 'Casos:        %', v_casos;
  RAISE NOTICE 'Seguimientos: %', v_seguimientos;
  RAISE NOTICE 'Sedes total:  % (activas: %)', v_sedes_total, v_sedes_activas;
  RAISE NOTICE '════════════════════════════════════════════════';
END $$;

-- ============================================================
-- PASO 1 — Verificación de seguridad
-- ============================================================

DO $$
DECLARE
  v_valle  INT;
  v_tolima INT;
  v_cauca  INT;
BEGIN
  SELECT COUNT(*) INTO v_valle  FROM sedes WHERE LOWER(nombre) = 'valle';
  SELECT COUNT(*) INTO v_tolima FROM sedes WHERE LOWER(nombre) = 'tolima';
  SELECT COUNT(*) INTO v_cauca  FROM sedes WHERE LOWER(nombre) = 'cauca';

  IF v_valle  = 0 THEN RAISE EXCEPTION 'ABORT: sede Valle no encontrada';  END IF;
  IF v_tolima = 0 THEN RAISE EXCEPTION 'ABORT: sede Tolima no encontrada'; END IF;
  IF v_cauca  = 0 THEN RAISE EXCEPTION 'ABORT: sede Cauca no encontrada';  END IF;

  RAISE NOTICE 'OK: las 3 sedes reales existen';
END $$;

-- ============================================================
-- PASO 2 — Deshabilitar triggers de auditoría/automatización
-- ============================================================
-- Durante el cleanup queremos:
--   - Que casos_historial NO intente registrar los DELETE de casos_comite
--     (causaría el error de FK que vimos en v1)
--   - Que seguimientos NO disparen programar_siguiente_evaluacion al ser
--     manipulados (innecesario en un cleanup masivo)
--
-- Estos triggers se vuelven a habilitar en el paso 6.

ALTER TABLE casos_comite DISABLE TRIGGER trg_caso_historial;
ALTER TABLE seguimientos DISABLE TRIGGER tr_siguiente_evaluacion;

DO $$
BEGIN
  RAISE NOTICE 'OK: triggers deshabilitados temporalmente';
END $$;

-- ============================================================
-- PASO 3 — Borrar dominio clínico en orden de dependencias
-- ============================================================

DELETE FROM casos_historial;
DELETE FROM alertas;
DELETE FROM desenlaces;
DELETE FROM seguimientos;
DELETE FROM medicamentos;
DELETE FROM casos_comite;
DELETE FROM diagnosticos;
DELETE FROM pacientes;
DELETE FROM medicos;

-- Verificación post-borrado
DO $$
DECLARE
  v_pacientes INT; v_casos INT; v_medicos INT; v_historial INT;
BEGIN
  SELECT COUNT(*) INTO v_pacientes FROM pacientes;
  SELECT COUNT(*) INTO v_casos     FROM casos_comite;
  SELECT COUNT(*) INTO v_medicos   FROM medicos;
  SELECT COUNT(*) INTO v_historial FROM casos_historial;

  IF v_pacientes > 0 OR v_casos > 0 OR v_medicos > 0 OR v_historial > 0 THEN
    RAISE EXCEPTION 'ABORT: cleanup incompleto (pac=% casos=% med=% hist=%)',
      v_pacientes, v_casos, v_medicos, v_historial;
  END IF;

  RAISE NOTICE 'OK: dominio clínico borrado completamente';
END $$;

-- ============================================================
-- PASO 4 — Reset de secuencias del dominio clínico
-- ============================================================

ALTER SEQUENCE pacientes_id_seq        RESTART WITH 1;
ALTER SEQUENCE medicos_id_seq          RESTART WITH 1;
ALTER SEQUENCE diagnosticos_id_seq     RESTART WITH 1;
ALTER SEQUENCE casos_comite_id_seq     RESTART WITH 1;
ALTER SEQUENCE seguimientos_id_seq     RESTART WITH 1;
ALTER SEQUENCE medicamentos_id_seq     RESTART WITH 1;
ALTER SEQUENCE alertas_id_seq          RESTART WITH 1;
ALTER SEQUENCE desenlaces_id_seq       RESTART WITH 1;
ALTER SEQUENCE casos_historial_id_seq  RESTART WITH 1;

-- ============================================================
-- PASO 5 — Renumerar sedes a IDs 1/2/3
-- ============================================================

-- 5a. Verificar que no hay FKs colgando
DO $$
DECLARE
  v_refs INT := 0;
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM casos_comite WHERE sede_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM pacientes    WHERE sede_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM medicos      WHERE sede_id IS NOT NULL;
  v_refs := v_refs + v_count;

  IF v_refs > 0 THEN
    RAISE EXCEPTION 'ABORT: aún hay % FKs apuntando a sedes', v_refs;
  END IF;

  RAISE NOTICE 'OK: 0 FKs apuntando a sedes, seguro renumerar';
END $$;

-- 5b. Borrar todas las sedes existentes
DELETE FROM sedes;

-- 5c. Reset de secuencia
ALTER SEQUENCE sedes_id_seq RESTART WITH 1;

-- 5d. Re-insertar las 3 sedes reales en orden deseado
INSERT INTO sedes (nombre, ciudad, activa) VALUES
  ('Valle',  'Cali',     TRUE),
  ('Tolima', 'Ibagué',   TRUE),
  ('Cauca',  'Popayán',  TRUE);

-- ============================================================
-- PASO 6 — Re-habilitar triggers
-- ============================================================
-- CRÍTICO: si esto falla, la auditoría queda apagada en producción.
-- Por eso lo dejamos como el penúltimo paso, dentro de la transacción.

ALTER TABLE casos_comite ENABLE TRIGGER trg_caso_historial;
ALTER TABLE seguimientos ENABLE TRIGGER tr_siguiente_evaluacion;

-- Verificar que quedaron habilitados
DO $$
DECLARE
  v_disabled INT;
BEGIN
  SELECT COUNT(*) INTO v_disabled
  FROM pg_trigger
  WHERE tgname IN ('trg_caso_historial', 'tr_siguiente_evaluacion')
    AND tgenabled = 'D';  -- D = disabled

  IF v_disabled > 0 THEN
    RAISE EXCEPTION 'ABORT: % triggers quedaron deshabilitados', v_disabled;
  END IF;

  RAISE NOTICE 'OK: triggers re-habilitados';
END $$;

-- ============================================================
-- PASO 7 — Verificación final
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM sedes;

  IF v_total <> 3 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 3 sedes, hay %', v_total;
  END IF;

  RAISE NOTICE '════════ ESTADO FINAL ════════';
  RAISE NOTICE 'Sedes (deberían ser exactamente 3):';
  FOR rec IN SELECT id, nombre, ciudad, activa FROM sedes ORDER BY id LOOP
    RAISE NOTICE '  ID=% | % | % | activa=%', rec.id, rec.nombre, rec.ciudad, rec.activa;
  END LOOP;
  RAISE NOTICE '════════════════════════════════';
  RAISE NOTICE 'OK: cleanup completado exitosamente';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
-- Ejecutar después del COMMIT para confirmar visualmente:
--
--   -- Sedes
--   SELECT id, nombre, ciudad, activa FROM sedes ORDER BY id;
--   -- Esperado: 1=Valle, 2=Tolima, 3=Cauca, todas activas
--
--   -- Que los triggers quedaron habilitados (CRÍTICO)
--   SELECT tgname,
--          CASE tgenabled
--            WHEN 'O' THEN 'enabled'
--            WHEN 'D' THEN 'DISABLED ⚠️'
--            ELSE tgenabled::text
--          END AS estado
--   FROM pg_trigger
--   WHERE tgrelid IN ('casos_comite'::regclass, 'seguimientos'::regclass)
--     AND NOT tgisinternal
--   ORDER BY tgname;
--   -- Esperado: TODOS en 'enabled'. Si alguno dice 'DISABLED' avisarme.
--
--   -- Inventario
--   SELECT 'pacientes' tabla, COUNT(*) FROM pacientes
--   UNION ALL SELECT 'medicos', COUNT(*) FROM medicos
--   UNION ALL SELECT 'casos_comite', COUNT(*) FROM casos_comite
--   UNION ALL SELECT 'eps', COUNT(*) FROM eps
--   UNION ALL SELECT 'gestores', COUNT(*) FROM gestores
--   UNION ALL SELECT 'protocolos', COUNT(*) FROM protocolos;
-- ============================================================
