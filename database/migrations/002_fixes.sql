-- ============================================================
-- SGICO: Migración 002 — Correcciones de Schema
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- =====================
-- 1. CORREGIR CHECK DE TIPO EN SEGUIMIENTOS
-- =====================
-- El constraint inline sin nombre recibe el nombre automático
-- "seguimientos_tipo_check" en PostgreSQL.

ALTER TABLE seguimientos
  DROP CONSTRAINT IF EXISTS seguimientos_tipo_check;

ALTER TABLE seguimientos
  ADD CONSTRAINT seguimientos_tipo_check
  CHECK (tipo IN (
    'post_comite',
    'trimestral_1', 'trimestral_2', 'trimestral_3', 'trimestral_4',
    'semestral', 'anual', 'ad_hoc'
  ));

-- =====================
-- 2. COLUMNAS FALTANTES EN SEGUIMIENTOS
-- =====================

ALTER TABLE seguimientos
  ADD COLUMN IF NOT EXISTS respuesta_recist VARCHAR(5)
    CHECK (respuesta_recist IN ('RC','RP','EE','PE','NE')),
  ADD COLUMN IF NOT EXISTS pfs_alcanzado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_progresion DATE,
  ADD COLUMN IF NOT EXISTS sitio_progresion VARCHAR(200),
  ADD COLUMN IF NOT EXISTS os_alcanzado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_muerte DATE,
  ADD COLUMN IF NOT EXISTS causa_muerte VARCHAR(200),
  ADD COLUMN IF NOT EXISTS toxicidad_grado_max INT
    CHECK (toxicidad_grado_max BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS toxicidad_descripcion TEXT,
  ADD COLUMN IF NOT EXISTS cambio_dosis BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspension_tratamiento BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS costo_periodo DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS costo_acumulado_tratamiento DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS estado_vital VARCHAR(20) DEFAULT 'vivo'
    CHECK (estado_vital IN ('vivo','fallecido','perdido')),
  ADD COLUMN IF NOT EXISTS fecha_ultimo_contacto DATE,
  ADD COLUMN IF NOT EXISTS fecha_primera_consulta DATE;

-- =====================
-- 3. RLS FALTANTE EN MEDICAMENTOS
-- =====================
-- La política "auth_all" ya existe en 001 pero ENABLE RLS fue omitido.

ALTER TABLE medicamentos ENABLE ROW LEVEL SECURITY;

-- =====================
-- 4. CORREGIR TRIGGER crear_seguimientos_auto
-- =====================
-- Reemplaza los tipos obsoletos (dia_3, dia_8, dia_15) por el
-- calendario real: post-comité a los 7 días, trimestrales, semestral y anual.
-- CREATE OR REPLACE actualiza la función en sitio; el trigger existente
-- (tr_auto_seguimientos) sigue apuntando a ella sin necesidad de recrearlo.

CREATE OR REPLACE FUNCTION crear_seguimientos_auto()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.decision IN ('aprobado', 'modificado') AND
       (OLD.decision IS NULL OR OLD.decision NOT IN ('aprobado', 'modificado')) THEN

        INSERT INTO seguimientos (caso_id, tipo, fecha_programada) VALUES
          (NEW.id, 'post_comite',  NEW.fecha_presentacion + INTERVAL  '7 days'),
          (NEW.id, 'trimestral_1', NEW.fecha_presentacion + INTERVAL  '3 months'),
          (NEW.id, 'trimestral_2', NEW.fecha_presentacion + INTERVAL  '6 months'),
          (NEW.id, 'trimestral_3', NEW.fecha_presentacion + INTERVAL  '9 months'),
          (NEW.id, 'trimestral_4', NEW.fecha_presentacion + INTERVAL '12 months'),
          (NEW.id, 'semestral',    NEW.fecha_presentacion + INTERVAL '18 months'),
          (NEW.id, 'anual',        NEW.fecha_presentacion + INTERVAL '24 months');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
