-- ============================================================
-- SGICO: Duración de los protocolos del catálogo (requiere migración 022)
-- ============================================================
--
-- Marca en el catálogo los protocolos que NO se costean por PFS:
--   fija → se costean los ciclos del esquema
--   tope → hasta progresión, con un máximo de ciclos
-- El resto queda 'hasta_progresion' (ciclos = PFS × 30 / días del ciclo).
-- Agrega además Abemaciclib adyuvante (monarchE), que no estaba.
--
-- ⚠️  Valores tomados del esquema de cada estudio pivotal. Que un oncólogo
--     de INOOS los revise: en cada caso se pueden ajustar (p. ej. ciclos
--     que el paciente ya recibió, o CAPOX 3 vs. 6 meses).
--
-- Ejecutar en: Supabase SQL Editor, DESPUÉS de la migración 022
-- ============================================================

BEGIN;

-- DURACIÓN FIJA — ciclos del esquema (adyuvancia, neoadyuvancia, consolidación, esquemas cerrados)
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 17, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-522';  -- 8 neoadyuvantes + 9 adyuvantes de pembrolizumab
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 8, dias_ciclo = 14 WHERE estudio_pivotal = 'CALGB 9741';  -- 4 AC + 4 paclitaxel dosis densa
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 6, dias_ciclo = 21 WHERE estudio_pivotal = 'TRAIN-2';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 14, dias_ciclo = 21 WHERE estudio_pivotal = 'KATHERINE';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 18, dias_ciclo = 21 WHERE estudio_pivotal = 'HERA';  -- 1 año
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 8, dias_ciclo = 21 WHERE estudio_pivotal = 'CREATE-X';  -- 6-8 ciclos (se toma el máximo)
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 39, dias_ciclo = 28 WHERE estudio_pivotal = 'ADAURA';  -- 3 años
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 3, dias_ciclo = 21 WHERE estudio_pivotal = 'CheckMate 816';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 14 WHERE estudio_pivotal = 'MOSAIC';  -- 6 meses
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 8, dias_ciclo = 21 WHERE estudio_pivotal = 'IDEA';  -- 6 meses (4 ciclos si es bajo riesgo: ajustar en el caso)
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 6, dias_ciclo = 14 WHERE estudio_pivotal = 'PRODIGE 23';  -- fase mFOLFIRINOX
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 8, dias_ciclo = 14 WHERE estudio_pivotal = 'FLOT4-AIO';  -- 4 preoperatorios + 4 posoperatorios
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 26, dias_ciclo = 14 WHERE estudio_pivotal = 'CheckMate 274';  -- 1 año
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 14 WHERE estudio_pivotal = 'PRODIGE 24';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 6, dias_ciclo = 28 WHERE estudio_pivotal = 'CONKO-001';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 17, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-564';  -- 1 año
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 18, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-054';  -- 1 año
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 13, dias_ciclo = 28 WHERE estudio_pivotal = 'CheckMate 238';  -- 1 año
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 13, dias_ciclo = 28 WHERE estudio_pivotal = 'COMBI-AD';  -- 12 meses
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 6, dias_ciclo = 21 WHERE estudio_pivotal = 'GOG-158';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 6, dias_ciclo = 28 WHERE estudio_pivotal = 'SWOG S1826';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 16, dias_ciclo = 21 WHERE estudio_pivotal = 'AETHERA';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 1, dias_ciclo = 21 WHERE estudio_pivotal = 'MRC TE19/EORTC 30982';  -- dosis única
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 3, dias_ciclo = 21 WHERE estudio_pivotal = 'ISG-STS 1001';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 39, dias_ciclo = 28 WHERE estudio_pivotal = 'SSG XVIII/AIO';  -- 3 años
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 28 WHERE estudio_pivotal = 'CATNON (EORTC 26053)';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 28 WHERE estudio_pivotal = 'CLL14';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 28 WHERE estudio_pivotal = 'AUGMENT';
UPDATE protocolos SET tipo_duracion = 'fija', ciclos_esquema = 12, dias_ciclo = 28 WHERE estudio_pivotal = 'CCTG CE.6/EORTC 26062';  -- temozolomida adyuvante

-- HASTA PROGRESIÓN CON TOPE — inmunoterapia metastásica (máximo 2 años)
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 26, dias_ciclo = 14 WHERE estudio_pivotal = 'PACIFIC';  -- hasta 12 meses
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 24, dias_ciclo = 28 WHERE estudio_pivotal = 'ADRIATIC';  -- hasta 24 meses
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-024';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-189';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-407';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-177';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-158';  -- (ambos protocolos KEYNOTE-158)
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-204';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-048';  -- (monoterapia y combinación)
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-006';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-355';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-826';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-590';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 35, dias_ciclo = 21 WHERE estudio_pivotal = 'KEYNOTE-811';
UPDATE protocolos SET tipo_duracion = 'tope', ciclos_esquema = 52, dias_ciclo = 14 WHERE estudio_pivotal = 'CheckMate 649';  -- nivolumab máximo 2 años

-- Abemaciclib adyuvante (monarchE): 2 años = 26 ciclos de 28 días
INSERT INTO protocolos (nombre, cie10, diagnostico, linea_tratamiento, regimen_estandar, moleculas_protocolo,
  estudio_pivotal, tipo_evidencia, referencia, evidencia_link, pfs_esperado_meses, os_esperado_meses,
  requiere_comite, activo, tipo_duracion, ciclos_esquema, dias_ciclo)
SELECT 'Abemaciclib + hormonoterapia adyuvante (alto riesgo)', 'C50.9',
  'Cáncer de mama RH+/HER2− temprano de alto riesgo de recaída, adyuvancia', NULL,
  'Abemaciclib 150 mg VO c/12 h continuo + hormonoterapia estándar, por 2 años',
  '["abemaciclib"]'::jsonb, 'monarchE', 'fase_3',
  'Johnston SRD, et al. J Clin Oncol 2020;38:3987-3998 (SLEi a 5 años: reducción del riesgo de recaída invasiva 32%)',
  'https://doi.org/10.1200/JCO.20.02514', NULL, NULL, true, true, 'fija', 26, 28
WHERE NOT EXISTS (SELECT 1 FROM protocolos WHERE estudio_pivotal = 'monarchE');

DO $$
DECLARE v_fija int; v_tope int;
BEGIN
  SELECT COUNT(*) INTO v_fija FROM protocolos WHERE tipo_duracion = 'fija' AND activo;
  SELECT COUNT(*) INTO v_tope FROM protocolos WHERE tipo_duracion = 'tope' AND activo;
  RAISE NOTICE 'Protocolos de duración fija: % · con tope: % · el resto, hasta progresión', v_fija, v_tope;
END $$;

COMMIT;

SELECT nombre, estudio_pivotal, tipo_duracion, ciclos_esquema, dias_ciclo
  FROM protocolos WHERE tipo_duracion <> 'hasta_progresion' AND activo
 ORDER BY tipo_duracion, nombre;
