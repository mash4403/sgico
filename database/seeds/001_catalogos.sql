-- ============================================================
-- SGICO: Seed 001 — Catálogos Iniciales (v2)
-- ============================================================
--
-- Este seed refleja el estado real de los catálogos en producción
-- al 2026-05-23, después del cleanup completo (migraciones 003 + 004).
--
-- Reemplaza la versión anterior (que tenía sedes Medellín ficticias,
-- EPS duplicadas, protocolos viejos sin refinar y gestores de prueba).
--
-- CUÁNDO USARLO:
--   - Al configurar un proyecto Supabase nuevo desde cero, después
--     de aplicar `001_baseline_schema.sql`.
--
-- IDEMPOTENTE: usa ON CONFLICT para no fallar si se corre 2 veces.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SEDES — Valle, Tolima, Cauca (cobertura suroccidente)
-- ============================================================

INSERT INTO sedes (nombre, ciudad, activa) VALUES
  ('Valle',  'Cali',    TRUE),
  ('Tolima', 'Ibagué',  TRUE),
  ('Cauca',  'Popayán', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. EPS — 13 EPS reales + 3 categorías especiales
-- ============================================================
-- Coomeva, Aliansalud y SOS EPS están desactivadas (la institución
-- no atiende esos convenios actualmente, pero se mantienen en BD por
-- compatibilidad con casos históricos).

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
  ('Otra',         'OTRA',   TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. PROTOCOLOS — 10 protocolos oncológicos refinados
-- ============================================================
-- Nombres clínicos precisos, CIE10 con subcategoría (.X) cuando aplica.
-- Datos de estudios pivotales (PFS / OS esperados) según evidencia
-- publicada. Estos valores alimentan vw_outcomes_vs_evidencia.

INSERT INTO protocolos
  (nombre, cie10, diagnostico, linea_tratamiento, regimen_estandar,
   estudio_pivotal, pfs_esperado_meses, os_esperado_meses, requiere_comite) VALUES

  -- NSCLC (Pulmón no microcítico)
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

  ('Durvalumab consolidación (NSCLC III)',
   'C34.9', 'NSCLC estadio III irresecable post-QRT', 1,
   'Durvalumab consolidación',
   'PACIFIC', 16.8, 47.5, TRUE),

  -- Mama
  ('Pertuzumab + Trastuzumab + Docetaxel',
   'C50.9', 'Cáncer de mama HER2+ metastásico', 1,
   'Pertuzumab + Trastuzumab + Docetaxel',
   'CLEOPATRA', 18.7, 56.5, TRUE),

  ('Ribociclib + Inhibidor de aromatasa',
   'C50.9', 'Cáncer de mama HR+/HER2- avanzado', 1,
   'Ribociclib + IA',
   'MONALEESA-2', 25.3, 63.9, TRUE),

  -- Renal
  ('Nivolumab + Ipilimumab (RCC)',
   'C64', 'Carcinoma renal avanzado', 1,
   'Nivolumab + Ipilimumab',
   'CHECKMATE-214', 11.6, 47.0, TRUE),

  -- Próstata
  ('Abiraterona + Prednisona (CPRC)',
   'C61', 'Cáncer próstata resistente a castración', 2,
   'Abiraterona + Prednisona',
   'COU-AA-301', 5.6, 15.8, TRUE),

  -- Colorrectal
  ('FOLFOX + Bevacizumab (CCR)',
   'C18', 'Cáncer colorrectal metastásico', 1,
   'mFOLFOX6 + Bevacizumab',
   'NO16966', 9.4, 21.3, FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. GESTORES — vacíos por defecto
-- ============================================================
-- Los gestores reales se cargan directamente desde la app o por
-- INSERT manual en producción. No se incluyen aquí porque varían
-- por institución y son datos sensibles (emails, roles, cohortes).
--
-- Ejemplo de cómo agregar manualmente:
--   INSERT INTO gestores (nombre, email, rol) VALUES
--     ('Nombre Real',  'correo@institucion.co',  'gestor_seguimiento'),
--     ('Otro Nombre',  'otro@institucion.co',    'coordinador');

-- ============================================================
-- VERIFICACIÓN POST-SEED
-- ============================================================

DO $$
DECLARE
  v_sedes      INT;
  v_eps        INT;
  v_protocolos INT;
BEGIN
  SELECT COUNT(*) INTO v_sedes      FROM sedes;
  SELECT COUNT(*) INTO v_eps        FROM eps;
  SELECT COUNT(*) INTO v_protocolos FROM protocolos;

  RAISE NOTICE '════════ SEED APLICADO ════════';
  RAISE NOTICE 'Sedes:      % (esperado: 3)',   v_sedes;
  RAISE NOTICE 'EPS:        % (esperado: 16)',  v_eps;
  RAISE NOTICE 'Protocolos: % (esperado: 10)',  v_protocolos;
  RAISE NOTICE 'Gestores:   vacíos (cargar manualmente)';
  RAISE NOTICE '═════════════════════════════════';
END $$;

COMMIT;
