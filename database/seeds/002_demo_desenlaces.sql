-- ============================================================
-- SGICO: Seed demo 002 — Casos con desenlaces para el tablero de calidad
-- (v2 — sentencias autónomas, sin transacción ni bloque DO)
-- ============================================================
--
-- OBJETIVO: sembrar 3 casos contrastantes + seguimientos para encender
-- las vistas de la migración 008:
--   CASO 1 (Ana)     — respondedor, aprobado tal cual (impacto 0), RP sostenida.
--   CASO 2 (Beatriz) — bajo desempeño, modificado al alza (sobrecosto), PE + toxicidad.
--   CASO 3 (Carlos)  — rechazado costo alto (ahorro $38M).
-- Benchmark del estudio: PFS 10m · OS 24m · ORR 65%.
--
-- POR QUÉ SIN TRANSACCIÓN: cada sentencia se confirma sola. Si una falla,
-- muestra su error directo y lo ya insertado queda, para diagnosticar sin
-- adivinar. Requisito: NO debe haber datos DEMO previos (casos=0 verificado).
--
-- RE-EJECUCIÓN: si necesitas repetir, primero limpia lo DEMO con el bloque
-- del final ("LIMPIEZA"), luego corre todo de nuevo desde arriba.
--
-- Ejecutar en: Supabase SQL Editor (todo de una vez, o bloque por bloque).
-- ============================================================

-- ── 1) Protocolo demo con benchmark conocido ──
INSERT INTO protocolos (nombre, cie10, diagnostico, linea_tratamiento,
    pfs_esperado_meses, os_esperado_meses, orr_esperada,
    estudio_pivotal, referencia, requiere_comite, version, activo)
SELECT 'DEMO — Esquema pivotal', 'C50', 'Cáncer de mama (demo)', 1,
    10, 24, 65, 'DEMO-TRIAL 2023', 'Seed de demostración', true, 1, true
WHERE NOT EXISTS (SELECT 1 FROM protocolos WHERE nombre = 'DEMO — Esquema pivotal');

-- ── 2) Pacientes ──
INSERT INTO pacientes (documento, tipo_documento, nombre, fecha_nacimiento, genero, eps_id, sede_id)
SELECT v.documento, v.tipo_documento, v.nombre, v.fecha_nacimiento, v.genero, v.eps_id, v.sede_id
FROM (VALUES
  ('DEMO001', 'CC', 'Ana Respondedora',       '1968-04-12'::date, 'F', 11, 5),
  ('DEMO002', 'CC', 'Beatriz Bajo Desempeño', '1959-09-30'::date, 'F', 11, 5),
  ('DEMO003', 'CC', 'Carlos Rechazado',       '1972-01-20'::date, 'M', 11, 5)
) AS v(documento, tipo_documento, nombre, fecha_nacimiento, genero, eps_id, sede_id)
WHERE NOT EXISTS (SELECT 1 FROM pacientes p WHERE p.documento = v.documento);

-- ── 3) Casos (uno por sentencia; protocolo por nombre, paciente por documento) ──
-- CASO 1 — Ana, respondedor, aprobado tal cual → impacto 0
INSERT INTO casos_comite (paciente_id, protocolo_id, sede_id, medico_id, gestor_id, decision,
    fecha_solicitud, fecha_presentacion, linea_actual,
    costo_previo, costo_estimado, costo_molecula_aprobada,
    pfs_esperado_estudio, os_esperado_estudio, tipo_comite, prioridad,
    motivo, justificacion, molecula_propuesta)
SELECT p.id, pr.id, 5, 94360955, 1111, 'aprobado',
    CURRENT_DATE - 65, CURRENT_DATE - 60, 1,
    3000000, 8000000, 8000000,
    10, 24, 'tumor_solido', 'normal',
    'Terapia dirigida de 1ª línea (demo)', 'Paciente candidata según estudio pivotal', 'Esquema demo A'
FROM pacientes p
CROSS JOIN (SELECT id FROM protocolos WHERE nombre = 'DEMO — Esquema pivotal' ORDER BY id DESC LIMIT 1) pr
WHERE p.documento = 'DEMO001'
  AND NOT EXISTS (SELECT 1 FROM casos_comite c JOIN pacientes p2 ON p2.id = c.paciente_id WHERE p2.documento = 'DEMO001');

-- CASO 2 — Beatriz, bajo desempeño, modificado al alza → sobrecosto
INSERT INTO casos_comite (paciente_id, protocolo_id, sede_id, medico_id, gestor_id, decision,
    fecha_solicitud, fecha_presentacion, linea_actual,
    costo_previo, costo_estimado, costo_molecula_aprobada,
    pfs_esperado_estudio, os_esperado_estudio, tipo_comite, prioridad,
    motivo, justificacion, molecula_propuesta)
SELECT p.id, pr.id, 5, 94360955, 1111, 'modificado',
    CURRENT_DATE - 34, CURRENT_DATE - 30, 2,
    4000000, 12000000, 15000000,
    10, 24, 'tumor_solido', 'normal',
    'Continuación de 2ª línea (demo)', 'Progresión documentada a primera línea', 'Esquema demo B'
FROM pacientes p
CROSS JOIN (SELECT id FROM protocolos WHERE nombre = 'DEMO — Esquema pivotal' ORDER BY id DESC LIMIT 1) pr
WHERE p.documento = 'DEMO002'
  AND NOT EXISTS (SELECT 1 FROM casos_comite c JOIN pacientes p2 ON p2.id = c.paciente_id WHERE p2.documento = 'DEMO002');

-- CASO 3 — Carlos, rechazado costo alto → ahorro
INSERT INTO casos_comite (paciente_id, protocolo_id, sede_id, medico_id, gestor_id, decision,
    fecha_solicitud, fecha_presentacion, linea_actual,
    costo_previo, costo_estimado, costo_molecula_aprobada,
    pfs_esperado_estudio, os_esperado_estudio, tipo_comite, prioridad,
    motivo, justificacion, molecula_propuesta)
SELECT p.id, pr.id, 5, 94360955, 1111, 'rechazado',
    CURRENT_DATE - 95, CURRENT_DATE - 90, 3,
    2000000, 40000000, NULL,
    10, 24, 'tumor_solido', 'normal',
    'Terapia de alto costo (demo)', 'Evidencia insuficiente de beneficio clínico', 'Esquema demo C'
FROM pacientes p
CROSS JOIN (SELECT id FROM protocolos WHERE nombre = 'DEMO — Esquema pivotal' ORDER BY id DESC LIMIT 1) pr
WHERE p.documento = 'DEMO003'
  AND NOT EXISTS (SELECT 1 FROM casos_comite c JOIN pacientes p2 ON p2.id = c.paciente_id WHERE p2.documento = 'DEMO003');

-- ── 4) Seguimientos caso 1 (Ana): RP sostenida, sin progresión, PFS real ~20m ──
INSERT INTO seguimientos (caso_id, tipo, estado, fecha_programada, fecha_realizada, decision_ejecutada, fecha_inicio_tratamiento)
VALUES (
  (SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO001'),
  'post_comite', 'realizado', (CURRENT_DATE - INTERVAL '20 months')::date, (CURRENT_DATE - INTERVAL '20 months')::date, true, (CURRENT_DATE - INTERVAL '20 months')::date
);

INSERT INTO seguimientos (caso_id, tipo, estado, fecha_programada, fecha_realizada,
    respuesta_recist, pfs_alcanzado, os_alcanzado, estado_vital, fecha_ultimo_contacto, costo_acumulado_tratamiento)
VALUES
  ((SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO001'),
   'trimestral_1', 'realizado', (CURRENT_DATE - INTERVAL '17 months')::date, (CURRENT_DATE - INTERVAL '17 months')::date, 'RP', false, false, 'vivo', (CURRENT_DATE - INTERVAL '17 months')::date, 12000000),
  ((SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO001'),
   'trimestral_2', 'realizado', (CURRENT_DATE - INTERVAL '9 months')::date,  (CURRENT_DATE - INTERVAL '9 months')::date,  'RP', false, false, 'vivo', (CURRENT_DATE - INTERVAL '9 months')::date, 28000000),
  ((SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO001'),
   'trimestral_3', 'realizado', (CURRENT_DATE - INTERVAL '1 months')::date,  (CURRENT_DATE - INTERVAL '1 months')::date,  'RP', false, false, 'vivo', CURRENT_DATE, 40000000);

-- ── 5) Seguimientos caso 2 (Beatriz): EE→PE, progresa a ~3m, toxicidad G3 ──
INSERT INTO seguimientos (caso_id, tipo, estado, fecha_programada, fecha_realizada, decision_ejecutada, fecha_inicio_tratamiento)
VALUES (
  (SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO002'),
  'post_comite', 'realizado', (CURRENT_DATE - INTERVAL '6 months')::date, (CURRENT_DATE - INTERVAL '6 months')::date, true, (CURRENT_DATE - INTERVAL '6 months')::date
);

INSERT INTO seguimientos (caso_id, tipo, estado, fecha_programada, fecha_realizada,
    respuesta_recist, pfs_alcanzado, fecha_progresion, os_alcanzado, estado_vital,
    fecha_ultimo_contacto, costo_acumulado_tratamiento, toxicidad_grado_max, suspension_tratamiento)
VALUES
  ((SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO002'),
   'trimestral_1', 'realizado', (CURRENT_DATE - INTERVAL '4 months')::date, (CURRENT_DATE - INTERVAL '4 months')::date, 'EE', false, NULL, false, 'vivo', (CURRENT_DATE - INTERVAL '4 months')::date, 30000000, 2, false),
  ((SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO002'),
   'trimestral_2', 'realizado', (CURRENT_DATE - INTERVAL '3 months')::date, (CURRENT_DATE - INTERVAL '3 months')::date, 'PE', true, (CURRENT_DATE - INTERVAL '3 months')::date, false, 'vivo', CURRENT_DATE, 60000000, 3, true);

-- evaluación pendiente → el cumplimiento no da 100%
INSERT INTO seguimientos (caso_id, tipo, estado, fecha_programada)
VALUES (
  (SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento = 'DEMO002'),
  'trimestral_3', 'pendiente', (CURRENT_DATE + INTERVAL '1 months')::date
);

-- caso 3 (rechazado): sin seguimientos, solo alimenta el ahorro económico

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT
  (SELECT count(*) FROM casos_comite)      AS casos,
  (SELECT count(*) FROM seguimientos)      AS segs,
  (SELECT count(*) FROM vw_desenlace_caso WHERE pfs_real_meses IS NOT NULL) AS con_pfs;

-- ============================================================
-- LIMPIEZA (para re-sembrar) — descomentar y correr ANTES de repetir
-- ============================================================
-- ALTER TABLE casos_comite DISABLE TRIGGER USER;
-- DELETE FROM seguimientos WHERE caso_id IN (
--   SELECT c.id FROM casos_comite c JOIN pacientes p ON p.id = c.paciente_id WHERE p.documento LIKE 'DEMO%');
-- DELETE FROM casos_comite WHERE paciente_id IN (SELECT id FROM pacientes WHERE documento LIKE 'DEMO%');
-- ALTER TABLE casos_comite ENABLE TRIGGER USER;
-- DELETE FROM pacientes WHERE documento LIKE 'DEMO%';
-- DELETE FROM protocolos WHERE nombre = 'DEMO — Esquema pivotal';
-- ============================================================
