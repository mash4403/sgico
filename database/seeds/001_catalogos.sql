-- ============================================================
-- SGICO: Datos Iniciales — Catálogos Colombia
-- ============================================================

-- Sedes (ajustar a tu institución)
INSERT INTO sedes (nombre, ciudad) VALUES
    ('Sede Principal', 'Medellín'),
    ('Sede Sur', 'Medellín'),
    ('Sede Norte', 'Medellín');

-- EPS principales Colombia
INSERT INTO eps (nombre, codigo) VALUES
    ('SURA EPS', 'EPS001'),
    ('Nueva EPS', 'EPS002'),
    ('Sanitas', 'EPS003'),
    ('Compensar', 'EPS004'),
    ('Salud Total', 'EPS005'),
    ('Coomeva', 'EPS006'),
    ('Famisanar', 'EPS007'),
    ('Coosalud', 'EPS008'),
    ('Mutual SER', 'EPS009'),
    ('Aliansalud', 'EPS010'),
    ('Comfenalco', 'EPS011'),
    ('SOS EPS', 'EPS012'),
    ('Particular', 'PART'),
    ('Prepagada', 'PREP'),
    ('Otra', 'OTRA');

-- Protocolos oncológicos ejemplo (con datos de estudios pivotales)
INSERT INTO protocolos (nombre, cie10, diagnostico, linea_tratamiento, regimen_estandar, estudio_pivotal, pfs_esperado_meses, os_esperado_meses, requiere_comite) VALUES
    ('Pembrolizumab + QT (NSCLC)', 'C34', 'NSCLC no escamoso avanzado', 1, 'Pembrolizumab + Pemetrexed + Platino', 'KEYNOTE-189', 8.8, 22.0, TRUE),
    ('Osimertinib (NSCLC EGFR+)', 'C34', 'NSCLC EGFR mutado', 1, 'Osimertinib 80mg/día', 'FLAURA', 18.9, 38.6, TRUE),
    ('Trastuzumab + Pertuzumab (Mama HER2+)', 'C50', 'Cáncer de mama HER2+ metastásico', 1, 'Pertuzumab + Trastuzumab + Docetaxel', 'CLEOPATRA', 18.7, 56.5, TRUE),
    ('Ribociclib + IA (Mama HR+)', 'C50', 'Cáncer de mama HR+/HER2- avanzado', 1, 'Ribociclib + Inhibidor de aromatasa', 'MONALEESA-2', 25.3, 63.9, TRUE),
    ('Abemaciclib + Fulvestrant (Mama HR+)', 'C50', 'Cáncer de mama HR+/HER2- 2a línea', 2, 'Abemaciclib + Fulvestrant', 'MONARCH-2', 16.4, 46.7, TRUE),
    ('Nivolumab + Ipilimumab (RCC)', 'C64', 'Carcinoma renal avanzado', 1, 'Nivolumab + Ipilimumab', 'CHECKMATE-214', 11.6, 47.0, TRUE),
    ('Abiraterona (Próstata)', 'C61', 'Cáncer de próstata resistente a castración', 2, 'Abiraterona + Prednisona', 'COU-AA-301', 5.6, 15.8, TRUE),
    ('Enzalutamida (Próstata)', 'C61', 'Cáncer de próstata resistente a castración', 2, 'Enzalutamida 160mg/día', 'AFFIRM', 8.3, 18.4, FALSE),
    ('FOLFOX (Colon)', 'C18', 'Cáncer colorrectal metastásico', 1, 'mFOLFOX6 + Bevacizumab', 'NO16966', 9.4, 21.3, FALSE),
    ('Durvalumab (Pulmón)', 'C34', 'NSCLC estadio III irresecable', 1, 'Durvalumab consolidación', 'PACIFIC', 16.8, 47.5, TRUE);

-- Gestores ejemplo
INSERT INTO gestores (nombre, email, rol) VALUES
    ('Ana Patricia López', 'ana.lopez@institucion.co', 'gestor_seguimiento'),
    ('Carlos Ramírez', 'carlos.ramirez@institucion.co', 'gestor_seguimiento'),
    ('María Lucía Gómez', 'maria.gomez@institucion.co', 'coordinador');
