-- ============================================================
-- SGICO: RESET de datos de prueba — dejar en cero
-- ============================================================
--
-- OBJETIVO: borrar TODO el dominio clínico de prueba (pacientes, casos,
--   actas, seguimientos, sesiones e historial) para empezar limpio.
--
-- CONSERVA (no toca):
--   - Catálogos: eps, sedes, medicos, gestores, protocolos
--   - Miembros del comité (participantes_comite) y sus firmas en Storage
--   - Usuarios de auth.users
--   - El esquema (tablas, triggers, funciones)
--
-- ⚠️  BORRA DE FORMA PERMANENTE todos los pacientes y casos. Úsalo solo
--     mientras estés en pruebas, antes de cargar datos reales.
--
-- Ejecutar en: Supabase SQL Editor  (es una sola transacción BEGIN/COMMIT)
-- ============================================================

BEGIN;

-- ── PASO 0 — Inventario antes ──────────────────────────────
DO $$
DECLARE v_pac INT; v_cas INT; v_act INT; v_seg INT; v_ses INT; v_mie INT;
BEGIN
  SELECT COUNT(*) INTO v_pac FROM pacientes;
  SELECT COUNT(*) INTO v_cas FROM casos_comite;
  SELECT COUNT(*) INTO v_act FROM actas_comite;
  SELECT COUNT(*) INTO v_seg FROM seguimientos;
  SELECT COUNT(*) INTO v_ses FROM sesiones_comite;
  SELECT COUNT(*) INTO v_mie FROM participantes_comite;
  RAISE NOTICE '════════ ANTES DEL RESET ════════';
  RAISE NOTICE 'Pacientes: %  | Casos: %  | Actas: %', v_pac, v_cas, v_act;
  RAISE NOTICE 'Seguimientos: %  | Sesiones: %', v_seg, v_ses;
  RAISE NOTICE 'Miembros del comité (se conservan): %', v_mie;
  RAISE NOTICE '═════════════════════════════════';
END $$;

-- ── PASO 1 — Desactivar triggers de auditoría/automatización ─
ALTER TABLE casos_comite DISABLE TRIGGER trg_caso_historial;
ALTER TABLE seguimientos DISABLE TRIGGER tr_siguiente_evaluacion;

-- ── PASO 2 — Borrar el dominio clínico en orden de dependencias ─
DELETE FROM casos_historial;
DELETE FROM alertas;
DELETE FROM desenlaces;
DELETE FROM seguimientos;
DELETE FROM actas_comite;
DELETE FROM medicamentos;
DELETE FROM casos_comite;
DELETE FROM diagnosticos;
DELETE FROM pacientes;
DELETE FROM sesiones_comite;

-- ── PASO 3 — Verificar que quedó en cero ───────────────────
DO $$
DECLARE v_pac INT; v_cas INT; v_act INT;
BEGIN
  SELECT COUNT(*) INTO v_pac FROM pacientes;
  SELECT COUNT(*) INTO v_cas FROM casos_comite;
  SELECT COUNT(*) INTO v_act FROM actas_comite;
  IF v_pac > 0 OR v_cas > 0 OR v_act > 0 THEN
    RAISE EXCEPTION 'ABORT: reset incompleto (pac=% casos=% actas=%)', v_pac, v_cas, v_act;
  END IF;
  RAISE NOTICE 'OK: dominio clínico borrado';
END $$;

-- ── PASO 4 — Reiniciar numeración de IDs (cosmético) ───────
ALTER SEQUENCE pacientes_id_seq        RESTART WITH 1;
ALTER SEQUENCE diagnosticos_id_seq     RESTART WITH 1;
ALTER SEQUENCE casos_comite_id_seq     RESTART WITH 1;
ALTER SEQUENCE seguimientos_id_seq     RESTART WITH 1;
ALTER SEQUENCE medicamentos_id_seq     RESTART WITH 1;
ALTER SEQUENCE alertas_id_seq          RESTART WITH 1;
ALTER SEQUENCE desenlaces_id_seq       RESTART WITH 1;
ALTER SEQUENCE casos_historial_id_seq  RESTART WITH 1;

-- ── PASO 5 — Reactivar triggers (CRÍTICO) ──────────────────
ALTER TABLE casos_comite ENABLE TRIGGER trg_caso_historial;
ALTER TABLE seguimientos ENABLE TRIGGER tr_siguiente_evaluacion;

DO $$
DECLARE v_off INT;
BEGIN
  SELECT COUNT(*) INTO v_off FROM pg_trigger
   WHERE tgname IN ('trg_caso_historial','tr_siguiente_evaluacion') AND tgenabled = 'D';
  IF v_off > 0 THEN RAISE EXCEPTION 'ABORT: % triggers quedaron apagados', v_off; END IF;
  RAISE NOTICE '════════ RESET COMPLETADO — BD en cero ════════';
  RAISE NOTICE 'Triggers reactivados. Catálogos y miembros conservados.';
  RAISE NOTICE '═══════════════════════════════════════════════';
END $$;

COMMIT;
