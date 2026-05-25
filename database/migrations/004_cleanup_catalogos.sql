-- ============================================================
-- SGICO: Migración 004 — Cleanup de catálogos duplicados
-- ============================================================
--
-- OBJETIVO: dejar los catálogos limpios y renumerados antes de
-- entrar a producción.
--
-- CONTEXTO: la BD tenía catálogos duplicados por re-ejecución
-- del seed en el pasado. Tras el cleanup 003 (dominio clínico),
-- es seguro reorganizar los catálogos porque ya no hay FKs.
--
-- LO QUE HACE:
--
--   1. EPS: borra los 30 registros actuales y reinserta 13 EPS
--      curadas (incluye EMSSANAR que falta).
--      Coomeva, Aliansalud y SOS EPS quedan con activa=false
--      (preservando las desactivaciones intencionales).
--      Sanitas queda como "Sanitas EPS".
--
--   2. PROTOCOLOS: borra los 20 registros actuales y reinserta
--      los 10 protocolos refinados (los que eran IDs 11-20),
--      ahora renumerados a 1-10.
--
--   3. GESTORES: borra los 6 registros, deja tabla vacía para
--      ingresar los gestores reales de producción.
--
--   4. Resetea las 3 secuencias para que próximos inserts
--      arranquen en el valor correcto.
--
-- LO QUE NO TOCA:
--   - schema (tablas, índices, triggers, funciones)
--   - sedes (ya están limpias 1=Valle, 2=Tolima, 3=Cauca)
--   - dominio clínico (ya vacío)
--
-- IRREVERSIBLE: los datos actuales se pierden. Como son
-- catálogos duplicados, es lo deseado.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 0 — Inventario inicial
-- ============================================================

DO $$
DECLARE
  v_eps INT; v_protocolos INT; v_gestores INT;
BEGIN
  SELECT COUNT(*) INTO v_eps         FROM eps;
  SELECT COUNT(*) INTO v_protocolos  FROM protocolos;
  SELECT COUNT(*) INTO v_gestores    FROM gestores;

  RAISE NOTICE '════════ INVENTARIO ANTES ════════';
  RAISE NOTICE 'EPS:        % (esperado: 30)', v_eps;
  RAISE NOTICE 'Protocolos: % (esperado: 20)', v_protocolos;
  RAISE NOTICE 'Gestores:   % (esperado: 6)',  v_gestores;
  RAISE NOTICE '══════════════════════════════════';
END $$;

-- ============================================================
-- PASO 1 — Verificación de seguridad: cero FKs apuntando a catálogos
-- ============================================================
-- Si alguien metió pacientes/casos/médicos entre el cleanup 003
-- y esta migración, abortamos para no perder datos.

DO $$
DECLARE
  v_refs INT := 0;
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pacientes    WHERE eps_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM casos_comite WHERE protocolo_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM casos_comite WHERE gestor_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM seguimientos WHERE gestor_id IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM alertas      WHERE resuelta_por IS NOT NULL;
  v_refs := v_refs + v_count;
  SELECT COUNT(*) INTO v_count FROM desenlaces   WHERE protocolo_id IS NOT NULL;
  v_refs := v_refs + v_count;

  IF v_refs > 0 THEN
    RAISE EXCEPTION 'ABORT: % FKs apuntando a catálogos. Hay datos clínicos que se perderían.', v_refs;
  END IF;

  RAISE NOTICE 'OK: 0 FKs a catálogos, seguro reorganizar';
END $$;

-- ============================================================
-- PASO 2 — EPS: borrar todo, reinsertar limpio
-- ============================================================

DELETE FROM eps;
ALTER SEQUENCE eps_id_seq RESTART WITH 1;

-- Reinsertar las 13 EPS curadas en orden lógico.
-- Las 3 con activa=false son las que estaban desactivadas en producción
-- (Coomeva, Aliansalud, SOS EPS).
-- Sanitas queda como "Sanitas EPS" (nombre más formal acordado).
-- EMSSANAR se agrega porque es fundamental en Cauca/Valle.

INSERT INTO eps (nombre, codigo, activa) VALUES
  ('SURA EPS',     'EPS001', TRUE),
  ('Nueva EPS',    'EPS002', TRUE),
  ('Sanitas EPS',  'EPS003', TRUE),
  ('Compensar',    'EPS004', TRUE),
  ('Salud Total',  'EPS005', TRUE),
  ('Coomeva',      'EPS006', FALSE),
  ('Famisanar',    'EPS007', TRUE),
  ('Coosalud',     'EPS008', TRUE),
  ('Mutual SER',   'EPS009', TRUE),
  ('Aliansalud',   'EPS010', FALSE),
  ('Comfenalco',   'EPS011', TRUE),
  ('SOS EPS',      'EPS012', FALSE),
  ('EMSSANAR',     'EPS013', TRUE),
  ('Particular',   'PART',   TRUE),
  ('Prepagada',    'PREP',   TRUE),
  ('Otra',         'OTRA',   TRUE);

-- Verificación
DO $$
DECLARE v_total INT; v_activas INT; v_inactivas INT;
BEGIN
  SELECT COUNT(*) INTO v_total      FROM eps;
  SELECT COUNT(*) INTO v_activas    FROM eps WHERE activa = TRUE;
  SELECT COUNT(*) INTO v_inactivas  FROM eps WHERE activa = FALSE;

  IF v_total <> 16 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 16 EPS, hay %', v_total;
  END IF;

  RAISE NOTICE 'OK: EPS reinsertadas. Total=% Activas=% Inactivas=%',
    v_total, v_activas, v_inactivas;
END $$;

-- ============================================================
-- PASO 3 — PROTOCOLOS: borrar todo, reinsertar los 10 refinados
-- ============================================================

DELETE FROM protocolos;
ALTER SEQUENCE protocolos_id_seq RESTART WITH 1;

-- Reinsertar los 10 protocolos refinados (eran IDs 11-20).
-- Nombres médicos precisos, CIE10 con subcategoría .X cuando aplica.

INSERT INTO protocolos
  (nombre, cie10, diagnostico, linea_tratamiento, regimen_estandar,
   estudio_pivotal, pfs_esperado_meses, os_esperado_meses, requiere_comite) VALUES

  ('Pembrolizumab + Pemetrexed + Platino',
   'C34.9', 'NSCLC no escamoso avanzado', 1,
   'Pembrolizumab + Pemetrexed + Platino',
   'KEYNOTE-189', 8.8, 22.0, TRUE),

  ('Pembrolizumab mono (PDL1≥50%)',
   'C34.9', 'NSCLC PDL1≥50%', 1,
   'Pembrolizumab monoterapia',
   'KEYNOTE-024', 10.3, 30.0, TRUE),

  ('Osimertinib 1L',
   'C34.9', 'NSCLC EGFR mutado', 1,
   'Osimertinib 80mg/día',
   'FLAURA', 18.9, 38.6, TRUE),

  ('Osimertinib 2L (T790M)',
   'C34.9', 'NSCLC EGFR T790M+ resistente', 2,
   'Osimertinib 80mg/día',
   'AURA3', 10.1, 26.8, TRUE),

  ('Pertuzumab + Trastuzumab + Docetaxel',
   'C50.9', 'Cáncer de mama HER2+ metastásico', 1,
   'Pertuzumab + Trastuzumab + Docetaxel',
   'CLEOPATRA', 18.7, 56.5, TRUE),

  ('Ribociclib + Inhibidor de aromatasa',
   'C50.9', 'Cáncer de mama HR+/HER2- avanzado', 1,
   'Ribociclib + IA',
   'MONALEESA-2', 25.3, 63.9, TRUE),

  ('Nivolumab + Ipilimumab (RCC)',
   'C64', 'Carcinoma renal avanzado', 1,
   'Nivolumab + Ipilimumab',
   'CHECKMATE-214', 11.6, 47.0, TRUE),

  ('Abiraterona + Prednisona (CPRC)',
   'C61', 'Cáncer próstata resistente a castración', 2,
   'Abiraterona + Prednisona',
   'COU-AA-301', 5.6, 15.8, TRUE),

  ('FOLFOX + Bevacizumab (CCR)',
   'C18', 'Cáncer colorrectal metastásico', 1,
   'mFOLFOX6 + Bevacizumab',
   'NO16966', 9.4, 21.3, FALSE),

  ('Durvalumab consolidación (NSCLC III)',
   'C34.9', 'NSCLC estadio III irresecable post-QRT', 1,
   'Durvalumab consolidación',
   'PACIFIC', 16.8, 47.5, TRUE);

DO $$
DECLARE v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM protocolos;
  IF v_total <> 10 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 10 protocolos, hay %', v_total;
  END IF;
  RAISE NOTICE 'OK: 10 protocolos reinsertados';
END $$;

-- ============================================================
-- PASO 4 — GESTORES: borrar todo, dejar tabla vacía
-- ============================================================
-- En producción se ingresarán los gestores reales (con email
-- corporativo, rol por cohorte/EPS, etc).

DELETE FROM gestores;
ALTER SEQUENCE gestores_id_seq RESTART WITH 1;

DO $$
DECLARE v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM gestores;
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'ABORT: se esperaba tabla gestores vacía, hay %', v_total;
  END IF;
  RAISE NOTICE 'OK: tabla gestores vacía, lista para datos reales';
END $$;

-- ============================================================
-- PASO 5 — Verificación final
-- ============================================================

DO $$
DECLARE
  v_eps INT; v_eps_activas INT;
  v_protocolos INT;
  v_gestores INT;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO v_eps         FROM eps;
  SELECT COUNT(*) INTO v_eps_activas FROM eps WHERE activa = TRUE;
  SELECT COUNT(*) INTO v_protocolos  FROM protocolos;
  SELECT COUNT(*) INTO v_gestores    FROM gestores;

  RAISE NOTICE '════════ ESTADO FINAL ════════';
  RAISE NOTICE 'EPS:        % (activas: %)', v_eps, v_eps_activas;
  RAISE NOTICE 'Protocolos: %', v_protocolos;
  RAISE NOTICE 'Gestores:   %', v_gestores;
  RAISE NOTICE '──────────────────────────────';
  RAISE NOTICE 'EPS inactivas:';
  FOR rec IN SELECT id, nombre FROM eps WHERE activa = FALSE ORDER BY id LOOP
    RAISE NOTICE '  ID=% | %', rec.id, rec.nombre;
  END LOOP;
  RAISE NOTICE '══════════════════════════════';
  RAISE NOTICE 'OK: cleanup de catálogos completado';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
--   SELECT id, nombre, codigo, activa FROM eps ORDER BY id;
--   -- Esperado: 16 EPS, IDs 1-16, EMSSANAR en id=13,
--   --           Coomeva/Aliansalud/SOS EPS con activa=false
--
--   SELECT id, nombre, cie10, linea_tratamiento, activo FROM protocolos ORDER BY id;
--   -- Esperado: 10 protocolos, IDs 1-10, todos activos
--
--   SELECT COUNT(*) FROM gestores;  -- Esperado: 0
--
-- ============================================================
