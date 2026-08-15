-- ============================================================
-- SGICO: Migración 008 — Indicadores de calidad y desenlaces
-- ============================================================
--
-- OBJETIVO: cerrar el "loop de calidad" del comité oncológico.
-- No basta con proyectar costo al aprobar; hay que verificar que el
-- tratamiento aprobado se esté dando, que el paciente responda, y
-- comparar nuestro PFS/OS real contra el estudio pivotal de decisión,
-- para no sostener tratamientos de alto costo que no son efectivos.
--
-- DECISIONES DE DISEÑO (acordadas con el usuario):
--   - Rollup de desenlaces por VISTA que calcula sobre `seguimientos`
--     (no se materializa la tabla `desenlaces`). Siempre fresco, sin
--     triggers ni sincronización. `desenlaces` queda dormida para una
--     posible materialización futura.
--   - Se agrega `orr_esperada` a `protocolos` para poder comparar la
--     tasa de respuesta objetiva contra el estudio pivotal.
--   - El costo aprobado por el comité usa la columna YA EXISTENTE
--     `casos_comite.costo_molecula_aprobada` (no se crea columna nueva).
--   - Impacto económico: aprobar la propuesta tal cual = 0 (el comité no
--     cambió nada). Solo generan ahorro/sobrecosto los rechazos (costo
--     evitado) y las aprobaciones a un costo distinto del propuesto.
--     Convención: impacto POSITIVO = ahorro, NEGATIVO = sobrecosto.
--
-- VERIFICACIÓN PREVIA:
--   - `protocolos` NO tiene columna de ORR (verificado con introspección).
--   - `casos_comite.costo_molecula_aprobada` SÍ existe (numeric).
--   - `seguimientos` tiene el anclaje de fechas para calcular PFS/OS real
--     (fecha_inicio_tratamiento, fecha_progresion, fecha_muerte,
--     fecha_ultimo_contacto) y respuesta_recist.
--
-- LO QUE HACE:
--   1. Agrega `protocolos.orr_esperada` (numeric, nullable).
--   2. Crea la vista rollup `vw_desenlace_caso` (un renglón por caso).
--   3. Crea 4 vistas de indicadores: efectividad vs pivotal, cumplimiento
--      del loop, riesgo costo/efectividad (worklist), e impacto económico
--      mensual con acumulado.
--
-- LO QUE NO HACE:
--   - No materializa `desenlaces` ni crea triggers.
--   - No modifica datos existentes.
--   - No define el umbral de "alto costo" (es política institucional);
--      el costo real se expone como columna para filtrar en el tablero.
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'casos_comite'
      AND column_name = 'costo_molecula_aprobada'
  ) THEN
    RAISE EXCEPTION 'ABORT: casos_comite.costo_molecula_aprobada no existe (se esperaba preexistente)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'seguimientos'
  ) THEN
    RAISE EXCEPTION 'ABORT: la tabla seguimientos no existe';
  END IF;

  RAISE NOTICE 'OK: condiciones previas validadas';
END $$;

-- ============================================================
-- PASO 2 — Nueva columna: ORR esperada del estudio pivotal
-- ============================================================

ALTER TABLE protocolos
  ADD COLUMN IF NOT EXISTS orr_esperada NUMERIC;

COMMENT ON COLUMN protocolos.orr_esperada
  IS 'Tasa de respuesta objetiva (ORR, %) reportada por el estudio pivotal. NULL = no disponible; sin ella la ORR real no se compara contra el estudio.';

-- ============================================================
-- PASO 3 — Vista rollup: un desenlace consolidado por caso
-- ============================================================
--
-- Calcula PFS/OS real (meses) desde las fechas de seguimientos:
--   PFS = (progresión | último contacto) − inicio de tratamiento
--   OS  = (muerte     | último contacto) − inicio de tratamiento
-- La mejor respuesta RECIST se resuelve por prioridad CR>PR>SD>PD.

CREATE OR REPLACE VIEW vw_desenlace_caso AS
WITH s AS (
  SELECT
    caso_id,
    MIN(fecha_inicio_tratamiento)                             AS fecha_inicio_tx,
    BOOL_OR(COALESCE(decision_ejecutada, false))              AS decision_ejecutada,
    BOOL_OR(COALESCE(pfs_alcanzado, false))                   AS evento_pfs,
    MIN(fecha_progresion)                                     AS fecha_progresion,
    BOOL_OR(COALESCE(os_alcanzado, false))                    AS evento_os,
    MIN(fecha_muerte)                                         AS fecha_muerte,
    -- RECIST en español (CHECK de seguimientos): RC>RP>EE>PE
    MIN(CASE respuesta_recist
          WHEN 'RC' THEN 1 WHEN 'RP' THEN 2
          WHEN 'EE' THEN 3 WHEN 'PE' THEN 4 ELSE 9 END)       AS mejor_resp_rank,
    MAX(fecha_ultimo_contacto)                                AS fecha_ultimo_contacto,
    MAX(costo_acumulado_tratamiento)                          AS costo_real_acumulado,
    MAX(toxicidad_grado_max)                                  AS toxicidad_max,
    BOOL_OR(COALESCE(suspension_tratamiento, false))          AS suspension_toxicidad,
    COUNT(*) FILTER (WHERE tipo IS DISTINCT FROM 'post_comite')                            AS n_eval_programadas,
    COUNT(*) FILTER (WHERE tipo IS DISTINCT FROM 'post_comite' AND estado = 'realizado')   AS n_eval_realizadas
  FROM seguimientos
  GROUP BY caso_id
)
SELECT
  c.id                                                        AS caso_id,
  c.decision,
  c.protocolo_id,
  pr.nombre                                                   AS protocolo,
  pr.estudio_pivotal,
  c.oportunidad_dias,
  -- benchmark del estudio pivotal (protocolo, con respaldo en el caso)
  COALESCE(pr.pfs_esperado_meses, c.pfs_esperado_estudio)     AS pfs_esperado,
  COALESCE(pr.os_esperado_meses,  c.os_esperado_estudio)      AS os_esperado,
  pr.orr_esperada,
  -- respuesta
  CASE s.mejor_resp_rank WHEN 1 THEN 'RC' WHEN 2 THEN 'RP'
       WHEN 3 THEN 'EE' WHEN 4 THEN 'PE' ELSE NULL END        AS mejor_respuesta,
  (s.mejor_resp_rank IN (1, 2))                               AS respondedor,   -- RC o RP = respuesta objetiva
  -- PFS real (meses)
  s.fecha_inicio_tx,
  s.evento_pfs,
  CASE WHEN s.fecha_inicio_tx IS NOT NULL
       THEN ROUND((COALESCE(s.fecha_progresion, s.fecha_ultimo_contacto) - s.fecha_inicio_tx) / 30.44, 1)
  END                                                         AS pfs_real_meses,
  -- OS real (meses)
  s.evento_os,
  CASE WHEN s.fecha_inicio_tx IS NOT NULL
       THEN ROUND((COALESCE(s.fecha_muerte, s.fecha_ultimo_contacto) - s.fecha_inicio_tx) / 30.44, 1)
  END                                                         AS os_real_meses,
  s.decision_ejecutada,
  s.costo_real_acumulado,
  s.toxicidad_max,
  s.suspension_toxicidad,
  COALESCE(s.n_eval_programadas, 0)                           AS n_eval_programadas,
  COALESCE(s.n_eval_realizadas, 0)                            AS n_eval_realizadas,
  -- identidad del paciente (para evaluación caso por caso)
  c.paciente_id,
  pac.nombre                                                  AS paciente_nombre,
  pac.documento                                               AS paciente_documento
FROM casos_comite c
LEFT JOIN s            ON s.caso_id = c.id
LEFT JOIN protocolos pr ON pr.id = c.protocolo_id
LEFT JOIN pacientes  pac ON pac.id = c.paciente_id;

COMMENT ON VIEW vw_desenlace_caso
  IS 'Rollup de desenlaces por caso calculado al vuelo desde seguimientos: PFS/OS real, mejor respuesta RECIST, costo real acumulado, toxicidad y cumplimiento, con el benchmark del estudio pivotal.';

-- ============================================================
-- PASO 4 — BLOQUE B: efectividad real vs estudio pivotal
-- ============================================================

CREATE OR REPLACE VIEW vw_kpi_efectividad AS
SELECT
  -- PFS
  COUNT(*) FILTER (WHERE pfs_real_meses IS NOT NULL)                              AS n_con_pfs,
  ROUND(AVG(pfs_real_meses) FILTER (WHERE pfs_real_meses IS NOT NULL), 1)         AS pfs_real_prom,
  ROUND(AVG(pfs_esperado)   FILTER (WHERE pfs_real_meses IS NOT NULL), 1)         AS pfs_esperado_prom,
  ROUND( AVG(pfs_real_meses) FILTER (WHERE pfs_real_meses IS NOT NULL)
       / NULLIF(AVG(pfs_esperado) FILTER (WHERE pfs_real_meses IS NOT NULL), 0), 2) AS ratio_pfs,
  -- OS
  COUNT(*) FILTER (WHERE os_real_meses IS NOT NULL)                               AS n_con_os,
  ROUND(AVG(os_real_meses) FILTER (WHERE os_real_meses IS NOT NULL), 1)           AS os_real_prom,
  ROUND(AVG(os_esperado)   FILTER (WHERE os_real_meses IS NOT NULL), 1)           AS os_esperado_prom,
  ROUND( AVG(os_real_meses) FILTER (WHERE os_real_meses IS NOT NULL)
       / NULLIF(AVG(os_esperado) FILTER (WHERE os_real_meses IS NOT NULL), 0), 2) AS ratio_os,
  -- ORR (respuesta objetiva) real vs esperada
  COUNT(*) FILTER (WHERE mejor_respuesta IS NOT NULL)                             AS n_evaluados_resp,
  ROUND(100.0 * COUNT(*) FILTER (WHERE respondedor)
       / NULLIF(COUNT(*) FILTER (WHERE mejor_respuesta IS NOT NULL), 0), 1)       AS orr_real_pct,
  ROUND(AVG(orr_esperada) FILTER (WHERE mejor_respuesta IS NOT NULL), 1)          AS orr_esperada_prom
FROM vw_desenlace_caso
WHERE decision IN ('aprobado', 'modificado');

COMMENT ON VIEW vw_kpi_efectividad
  IS 'Bloque B — efectividad real vs estudio pivotal: PFS/OS real vs esperado (ratio <1 = por debajo del estudio) y ORR real vs esperada.';

-- ============================================================
-- PASO 5 — BLOQUE A: cumplimiento del loop de calidad
-- ============================================================

CREATE OR REPLACE VIEW vw_kpi_cumplimiento AS
SELECT
  -- cumplimiento de evaluaciones de seguimiento
  SUM(n_eval_realizadas)                                                          AS evaluaciones_realizadas,
  SUM(n_eval_programadas)                                                         AS evaluaciones_programadas,
  ROUND(100.0 * SUM(n_eval_realizadas) / NULLIF(SUM(n_eval_programadas), 0), 1)   AS cumplimiento_seguimiento_pct,
  -- ejecución de la decisión (aprobados que iniciaron tratamiento)
  COUNT(*) FILTER (WHERE decision IN ('aprobado', 'modificado'))                  AS aprobados,
  COUNT(*) FILTER (WHERE decision IN ('aprobado', 'modificado') AND decision_ejecutada) AS aprobados_ejecutados,
  ROUND(100.0 * COUNT(*) FILTER (WHERE decision IN ('aprobado', 'modificado') AND decision_ejecutada)
       / NULLIF(COUNT(*) FILTER (WHERE decision IN ('aprobado', 'modificado')), 0), 1) AS ejecucion_decision_pct,
  -- oportunidad (tiempo a decisión)
  ROUND(AVG(oportunidad_dias) FILTER (WHERE oportunidad_dias IS NOT NULL), 1)      AS oportunidad_dias_prom
FROM vw_desenlace_caso;

COMMENT ON VIEW vw_kpi_cumplimiento
  IS 'Bloque A — cumplimiento del loop: % de seguimientos realizados, % de decisiones ejecutadas y oportunidad promedio en días.';

-- ============================================================
-- PASO 6 — BLOQUE C: riesgo costo/efectividad (worklist)
-- ============================================================
--
-- Lista de casos con bandera roja: progresó (PD) o PFS real muy por
-- debajo del esperado, o toxicidad severa. El "alto costo" se expone
-- como columna (costo_real_acumulado) para umbral/orden en el tablero,
-- porque el umbral es política institucional.

CREATE OR REPLACE VIEW vw_kri_costo_efectividad AS
SELECT
  caso_id,
  protocolo,
  mejor_respuesta,
  pfs_real_meses,
  pfs_esperado,
  ROUND(pfs_real_meses / NULLIF(pfs_esperado, 0), 2)                              AS ratio_pfs,
  costo_real_acumulado,
  toxicidad_max,
  suspension_toxicidad,
  ( mejor_respuesta = 'PE'
    OR (pfs_real_meses IS NOT NULL AND pfs_esperado IS NOT NULL
        AND pfs_real_meses < 0.5 * pfs_esperado) )                               AS baja_efectividad,
  ( COALESCE(toxicidad_max, 0) >= 3 OR suspension_toxicidad )                     AS toxicidad_severa
FROM vw_desenlace_caso
WHERE decision IN ('aprobado', 'modificado')
  AND (
        mejor_respuesta = 'PE'
     OR (pfs_real_meses IS NOT NULL AND pfs_esperado IS NOT NULL
         AND pfs_real_meses < 0.5 * pfs_esperado)
     OR COALESCE(toxicidad_max, 0) >= 3
     OR suspension_toxicidad
  );

COMMENT ON VIEW vw_kri_costo_efectividad
  IS 'Bloque C — worklist de riesgo: casos aprobados con baja efectividad (PD o PFS real < 50% del esperado) o toxicidad severa. El costo real se expone para aplicar el umbral de alto costo en el tablero.';

-- ============================================================
-- PASO 7 — BLOQUE D: impacto económico del comité (mensual)
-- ============================================================
--
-- Aprobar la propuesta tal cual = 0. Ahorro/sobrecosto solo de:
--   - rechazos: costo evitado = costo_estimado − costo_previo
--   - aprobaciones a costo distinto: costo_estimado − costo_molecula_aprobada
-- Convención: POSITIVO = ahorro, NEGATIVO = sobrecosto.

CREATE OR REPLACE VIEW vw_kpi_impacto_comite_mensual AS
WITH base AS (
  SELECT
    date_trunc('month', COALESCE(c.fecha_presentacion, c.fecha_solicitud))::date  AS mes,
    c.decision,
    COALESCE(c.costo_molecula_aprobada, c.costo_estimado)                         AS costo_aprobado_real,
    CASE
      WHEN c.decision IN ('aprobado', 'modificado')
        THEN COALESCE(c.costo_estimado, 0) - COALESCE(c.costo_molecula_aprobada, c.costo_estimado)
      WHEN c.decision = 'rechazado'
        THEN COALESCE(c.costo_estimado, 0) - COALESCE(c.costo_previo, 0)
      ELSE 0
    END                                                                          AS impacto_ahorro
  FROM casos_comite c
  WHERE c.costo_estimado IS NOT NULL
    AND c.decision IN ('aprobado', 'modificado', 'rechazado')
),
mensual AS (
  SELECT
    mes,
    SUM(impacto_ahorro)                                                          AS ahorro_comite,
    SUM(costo_aprobado_real) FILTER (WHERE decision IN ('aprobado', 'modificado')) AS total_aprobado,
    COUNT(*) FILTER (WHERE decision = 'aprobado')                                AS n_aprobados,
    COUNT(*) FILTER (WHERE decision = 'modificado')                              AS n_modificados,
    COUNT(*) FILTER (WHERE decision = 'rechazado')                               AS n_rechazados
  FROM base
  GROUP BY mes
)
SELECT
  mes,
  COALESCE(ahorro_comite, 0)                                                     AS ahorro_comite,        -- + ahorro / - sobrecosto
  COALESCE(total_aprobado, 0)                                                    AS total_aprobado,
  n_aprobados, n_modificados, n_rechazados,
  SUM(COALESCE(ahorro_comite, 0))
      OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)        AS ahorro_acumulado,
  SUM(COALESCE(total_aprobado, 0))
      OVER (ORDER BY mes ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)        AS total_aprobado_acumulado
FROM mensual
ORDER BY mes;

COMMENT ON VIEW vw_kpi_impacto_comite_mensual
  IS 'Bloque D — impacto económico mensual del comité: ahorro/sobrecosto (positivo = ahorro) y total aprobado, con acumulados corridos. Usa costo_molecula_aprobada como costo aprobado real.';

-- ============================================================
-- PASO 8 — Verificación final
-- ============================================================

DO $$
DECLARE
  v_col INT;
  v_views INT;
BEGIN
  SELECT COUNT(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'protocolos'
    AND column_name = 'orr_esperada';

  IF v_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: protocolos.orr_esperada no quedó creada';
  END IF;

  SELECT COUNT(*) INTO v_views
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name IN (
      'vw_desenlace_caso', 'vw_kpi_efectividad',
      'vw_kpi_cumplimiento', 'vw_kri_costo_efectividad',
      'vw_kpi_impacto_comite_mensual'
    );

  IF v_views <> 5 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 5 vistas, hay %', v_views;
  END IF;

  RAISE NOTICE '════════ MIGRACION 008 COMPLETADA ════════';
  RAISE NOTICE '  Columna nueva: protocolos.orr_esperada';
  RAISE NOTICE '  Vistas creadas: 5';
  RAISE NOTICE '    - vw_desenlace_caso (rollup)';
  RAISE NOTICE '    - vw_kpi_efectividad (B)';
  RAISE NOTICE '    - vw_kpi_cumplimiento (A)';
  RAISE NOTICE '    - vw_kri_costo_efectividad (C)';
  RAISE NOTICE '    - vw_kpi_impacto_comite_mensual (D)';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
--   SELECT * FROM vw_desenlace_caso;
--   SELECT * FROM vw_kpi_efectividad;
--   SELECT * FROM vw_kpi_cumplimiento;
--   SELECT * FROM vw_kri_costo_efectividad;
--   SELECT * FROM vw_kpi_impacto_comite_mensual;
--
-- (Todas saldrán vacías / en cero hasta que existan casos decididos
--  y seguimientos con desenlaces registrados.)
-- ============================================================
