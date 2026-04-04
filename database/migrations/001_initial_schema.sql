-- ============================================================
-- SGICO: Migración 001 — Schema Inicial
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- =====================
-- CATÁLOGOS
-- =====================

CREATE TABLE sedes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    ciudad VARCHAR(50) DEFAULT 'Medellín',
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE eps (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    codigo VARCHAR(20),
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE medicos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    especialidad VARCHAR(100),
    registro_medico VARCHAR(30),
    sede_id INT REFERENCES sedes(id),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gestores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    rol VARCHAR(50) DEFAULT 'gestor_seguimiento',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE protocolos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    cie10 VARCHAR(10),
    diagnostico VARCHAR(200),
    linea_tratamiento INT,
    regimen_estandar TEXT,
    moleculas_protocolo JSONB DEFAULT '[]',
    pfs_esperado_meses DECIMAL(5,1),
    os_esperado_meses DECIMAL(5,1),
    estudio_pivotal VARCHAR(200),
    referencia TEXT,
    requiere_comite BOOLEAN DEFAULT TRUE,
    fecha_vigencia DATE,
    version INT DEFAULT 1,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- PACIENTES
-- =====================

CREATE TABLE pacientes (
    id SERIAL PRIMARY KEY,
    tipo_documento VARCHAR(5) NOT NULL CHECK (tipo_documento IN ('CC','TI','CE','PA','RC','NIT')),
    documento VARCHAR(20) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    genero CHAR(1) CHECK (genero IN ('M','F','O')),
    fecha_nacimiento DATE,
    telefono1 VARCHAR(20),
    telefono2 VARCHAR(20),
    eps_id INT REFERENCES eps(id),
    sede_id INT REFERENCES sedes(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tipo_documento, documento)
);

CREATE TABLE diagnosticos (
    id SERIAL PRIMARY KEY,
    paciente_id INT REFERENCES pacientes(id) ON DELETE CASCADE,
    cie10 VARCHAR(10) NOT NULL,
    descripcion VARCHAR(300),
    estadio VARCHAR(20),
    perfil_molecular JSONB DEFAULT '{}',
    histologia VARCHAR(200),
    fecha_diagnostico DATE,
    metastasis_sitios TEXT,
    ecog INT CHECK (ecog BETWEEN 0 AND 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- CASOS COMITÉ
-- =====================

CREATE TABLE casos_comite (
    id SERIAL PRIMARY KEY,
    paciente_id INT REFERENCES pacientes(id) ON DELETE CASCADE,
    diagnostico_id INT REFERENCES diagnosticos(id),
    medico_id INT REFERENCES medicos(id),
    sede_id INT REFERENCES sedes(id),
    
    -- Solicitud
    fecha_solicitud DATE NOT NULL,
    tipo_comite VARCHAR(50) DEFAULT 'tumor_solido'
        CHECK (tipo_comite IN ('tumor_solido','hematologico','pediatrico','multidisciplinario')),
    motivo TEXT NOT NULL,
    linea_actual INT,
    linea_propuesta INT,
    
    -- Pre-comité
    tratamiento_previo TEXT,
    molecula_previa VARCHAR(200),
    costo_previo DECIMAL(15,2) DEFAULT 0,
    
    -- Propuesta
    molecula_propuesta VARCHAR(200),
    justificacion TEXT,
    tiene_invima BOOLEAN DEFAULT FALSE,
    en_unirse BOOLEAN DEFAULT FALSE,
    protocolo_id INT REFERENCES protocolos(id),
    presentacion_obligatoria BOOLEAN DEFAULT FALSE,
    
    -- Presentación
    fecha_presentacion DATE,
    oportunidad_dias INT GENERATED ALWAYS AS (
        CASE WHEN fecha_presentacion IS NOT NULL 
        THEN fecha_presentacion - fecha_solicitud 
        END
    ) STORED,
    
    -- Decisión
    decision VARCHAR(50) DEFAULT 'pendiente'
        CHECK (decision IN ('pendiente','aprobado','rechazado','modificado','diferido','pendiente_info')),
    molecula_aprobada VARCHAR(200),
    justificacion_decision TEXT,
    adherente_protocolo BOOLEAN,
    motivo_no_adherencia TEXT,
    
    -- Costos post
    costo_molecula_aprobada DECIMAL(15,2) DEFAULT 0,
    costo_post DECIMAL(15,2) DEFAULT 0,
    diferencia_costo DECIMAL(15,2) GENERATED ALWAYS AS (costo_post - costo_previo) STORED,
    
    -- Psicosocial
    valoracion_psicosocial BOOLEAN DEFAULT FALSE,
    
    -- Estado
    estado VARCHAR(30) DEFAULT 'activo'
        CHECK (estado IN ('activo','en_tratamiento','completado','progresion','cancelado','fallecido','perdido')),
    motivo_cancelacion TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- MEDICAMENTOS
-- =====================

CREATE TABLE medicamentos (
    id SERIAL PRIMARY KEY,
    caso_id INT REFERENCES casos_comite(id) ON DELETE CASCADE,
    momento VARCHAR(10) NOT NULL CHECK (momento IN ('antes','despues')),
    nombre VARCHAR(200) NOT NULL,
    forma_farmaceutica VARCHAR(100),
    concentracion VARCHAR(100),
    dosis VARCHAR(100),
    cantidad DECIMAL(10,2),
    valor_unitario DECIMAL(15,2) DEFAULT 0,
    valor_total DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- SEGUIMIENTOS
-- =====================

CREATE TABLE seguimientos (
    id SERIAL PRIMARY KEY,
    caso_id INT REFERENCES casos_comite(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL
        CHECK (tipo IN ('dia_3','dia_8','dia_15','mensual','trimestral','ad_hoc')),
    fecha_programada DATE NOT NULL,
    fecha_realizada DATE,
    gestor_id INT REFERENCES gestores(id),
    estado VARCHAR(20) DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','realizado','vencido','no_aplica')),
    decision_ejecutada BOOLEAN,
    motivo_no_ejecucion TEXT,
    estado_clinico VARCHAR(30)
        CHECK (estado_clinico IN ('estable','respuesta_parcial','respuesta_completa','progresion','fallecido','perdido',NULL)),
    fecha_inicio_tratamiento DATE,
    dias_a_inicio INT,
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- DESENLACES
-- =====================

CREATE TABLE desenlaces (
    id SERIAL PRIMARY KEY,
    paciente_id INT REFERENCES pacientes(id) ON DELETE CASCADE,
    caso_id INT REFERENCES casos_comite(id),
    mejor_respuesta VARCHAR(5)
        CHECK (mejor_respuesta IN ('RC','RP','EE','PE','NE')),
    fecha_mejor_respuesta DATE,
    fecha_inicio_tx DATE,
    fecha_progresion DATE,
    pfs_meses DECIMAL(5,1),
    evento_pfs BOOLEAN DEFAULT FALSE,
    fecha_muerte DATE,
    os_meses DECIMAL(5,1),
    evento_os BOOLEAN DEFAULT FALSE,
    causa_muerte VARCHAR(100),
    toxicidad_max INT CHECK (toxicidad_max BETWEEN 0 AND 5),
    toxicidad_descripcion TEXT,
    suspension_toxicidad BOOLEAN DEFAULT FALSE,
    protocolo_id INT REFERENCES protocolos(id),
    pfs_esperado DECIMAL(5,1),
    os_esperado DECIMAL(5,1),
    avac_estimado DECIMAL(5,2),
    costo_total DECIMAL(15,2),
    costo_avac DECIMAL(15,2),
    estado_vital VARCHAR(20) DEFAULT 'vivo'
        CHECK (estado_vital IN ('vivo','fallecido','perdido')),
    fecha_ultimo_contacto DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================
-- ALERTAS
-- =====================

CREATE TABLE alertas (
    id SERIAL PRIMARY KEY,
    caso_id INT REFERENCES casos_comite(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    mensaje TEXT,
    prioridad VARCHAR(10) DEFAULT 'media' CHECK (prioridad IN ('alta','media','baja')),
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa','resuelta','descartada')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resuelta_at TIMESTAMPTZ,
    resuelta_por INT REFERENCES gestores(id)
);

-- =====================
-- FUNCIONES AUTOMÁTICAS
-- =====================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pacientes_updated BEFORE UPDATE ON pacientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_casos_updated BEFORE UPDATE ON casos_comite
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-crear seguimientos cuando se aprueba un caso
CREATE OR REPLACE FUNCTION crear_seguimientos_auto()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.decision IN ('aprobado','modificado') AND 
       (OLD.decision IS NULL OR OLD.decision = 'pendiente') THEN
        
        INSERT INTO seguimientos (caso_id, tipo, fecha_programada) VALUES
            (NEW.id, 'dia_3',  NEW.fecha_presentacion + INTERVAL '3 days'),
            (NEW.id, 'dia_8',  NEW.fecha_presentacion + INTERVAL '8 days'),
            (NEW.id, 'dia_15', NEW.fecha_presentacion + INTERVAL '15 days');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_auto_seguimientos AFTER UPDATE ON casos_comite
    FOR EACH ROW EXECUTE FUNCTION crear_seguimientos_auto();

-- Auto-marcar seguimientos vencidos
CREATE OR REPLACE FUNCTION marcar_seguimientos_vencidos()
RETURNS void AS $$
BEGIN
    UPDATE seguimientos
    SET estado = 'vencido'
    WHERE estado = 'pendiente'
      AND fecha_programada < CURRENT_DATE;
    
    -- Crear alertas para vencidos sin alerta
    INSERT INTO alertas (caso_id, tipo, mensaje, prioridad)
    SELECT s.caso_id, 'seguimiento_vencido',
           'Seguimiento ' || s.tipo || ' vencido desde ' || s.fecha_programada,
           'alta'
    FROM seguimientos s
    WHERE s.estado = 'vencido'
      AND NOT EXISTS (
          SELECT 1 FROM alertas a 
          WHERE a.caso_id = s.caso_id 
            AND a.tipo = 'seguimiento_vencido'
            AND a.estado = 'activa'
            AND a.created_at > s.fecha_programada
      );
END;
$$ LANGUAGE plpgsql;

-- =====================
-- VISTAS KPI
-- =====================

CREATE OR REPLACE VIEW vw_dashboard_general AS
SELECT
    COUNT(*) AS total_casos,
    COUNT(*) FILTER (WHERE estado = 'activo') AS activos,
    COUNT(*) FILTER (WHERE estado = 'en_tratamiento') AS en_tratamiento,
    COUNT(*) FILTER (WHERE estado = 'fallecido') AS fallecidos,
    COUNT(*) FILTER (WHERE estado = 'progresion') AS en_progresion,
    COUNT(*) FILTER (WHERE estado = 'perdido') AS perdidos,
    COUNT(*) FILTER (WHERE estado = 'cancelado') AS cancelados,
    AVG(oportunidad_dias) FILTER (WHERE oportunidad_dias IS NOT NULL) AS oportunidad_promedio,
    COUNT(*) FILTER (WHERE adherente_protocolo = TRUE) * 100.0 / 
        NULLIF(COUNT(*) FILTER (WHERE adherente_protocolo IS NOT NULL), 0) AS pct_adherencia,
    SUM(costo_previo) AS costo_total_antes,
    SUM(costo_post) AS costo_total_despues,
    SUM(diferencia_costo) AS diferencia_total
FROM casos_comite;

CREATE OR REPLACE VIEW vw_kpi_mensual AS
SELECT
    DATE_TRUNC('month', fecha_presentacion)::DATE AS mes,
    COUNT(*) AS casos,
    COUNT(*) FILTER (WHERE decision = 'aprobado') AS aprobados,
    COUNT(*) FILTER (WHERE decision = 'rechazado') AS rechazados,
    COUNT(*) FILTER (WHERE decision = 'modificado') AS modificados,
    AVG(oportunidad_dias) AS oportunidad_prom,
    COUNT(*) FILTER (WHERE adherente_protocolo = TRUE) * 100.0 / 
        NULLIF(COUNT(*) FILTER (WHERE adherente_protocolo IS NOT NULL), 0) AS pct_adherencia,
    SUM(diferencia_costo) AS ahorro_mes
FROM casos_comite
WHERE fecha_presentacion IS NOT NULL
GROUP BY DATE_TRUNC('month', fecha_presentacion)
ORDER BY mes DESC;

CREATE OR REPLACE VIEW vw_seguimientos_pendientes AS
SELECT 
    s.id,
    s.caso_id,
    s.tipo,
    s.fecha_programada,
    s.estado,
    p.nombre AS paciente,
    p.documento,
    g.nombre AS gestor,
    c.molecula_aprobada,
    c.decision,
    CURRENT_DATE - s.fecha_programada AS dias_vencido
FROM seguimientos s
JOIN casos_comite c ON s.caso_id = c.id
JOIN pacientes p ON c.paciente_id = p.id
LEFT JOIN gestores g ON s.gestor_id = g.id
WHERE s.estado IN ('pendiente', 'vencido')
ORDER BY s.fecha_programada ASC;

CREATE OR REPLACE VIEW vw_outcomes_vs_evidencia AS
SELECT
    pr.nombre AS protocolo,
    pr.estudio_pivotal,
    pr.diagnostico,
    COUNT(*) AS n_pacientes,
    ROUND(AVG(d.pfs_meses)::NUMERIC, 1) AS pfs_real,
    pr.pfs_esperado_meses AS pfs_estudio,
    ROUND((AVG(d.pfs_meses) - pr.pfs_esperado_meses)::NUMERIC, 1) AS delta_pfs,
    ROUND(AVG(d.os_meses)::NUMERIC, 1) AS os_real,
    pr.os_esperado_meses AS os_estudio,
    ROUND((AVG(d.os_meses) - pr.os_esperado_meses)::NUMERIC, 1) AS delta_os,
    ROUND(AVG(d.costo_avac)::NUMERIC, 0) AS costo_avac_prom
FROM desenlaces d
JOIN protocolos pr ON d.protocolo_id = pr.id
WHERE d.pfs_meses IS NOT NULL OR d.os_meses IS NOT NULL
GROUP BY pr.nombre, pr.estudio_pivotal, pr.diagnostico,
         pr.pfs_esperado_meses, pr.os_esperado_meses;

-- =====================
-- ROW LEVEL SECURITY (Supabase)
-- =====================

ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos_comite ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE desenlaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden todo (ajustar por roles después)
CREATE POLICY "auth_all" ON pacientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON casos_comite FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON seguimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON desenlaces FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON alertas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON medicamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON sedes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON eps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON medicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON gestores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON protocolos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON diagnosticos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================
-- ÍNDICES
-- =====================

CREATE INDEX idx_casos_paciente ON casos_comite(paciente_id);
CREATE INDEX idx_casos_fecha ON casos_comite(fecha_presentacion);
CREATE INDEX idx_casos_estado ON casos_comite(estado);
CREATE INDEX idx_casos_decision ON casos_comite(decision);
CREATE INDEX idx_seguimientos_caso ON seguimientos(caso_id);
CREATE INDEX idx_seguimientos_fecha ON seguimientos(fecha_programada);
CREATE INDEX idx_seguimientos_estado ON seguimientos(estado);
CREATE INDEX idx_alertas_estado ON alertas(estado);
CREATE INDEX idx_pacientes_doc ON pacientes(tipo_documento, documento);
