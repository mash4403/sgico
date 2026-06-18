-- ============================================================
-- SGICO: Migración 005 — Tabla actas_comite (Mesa de comité)
-- ============================================================
--
-- OBJETIVO: crear el modelo de datos para registrar las actas
-- generadas en la mesa de comité oncológico.
--
-- DECISIONES DE DISEÑO (acordadas con el usuario):
--   1. UN acta por caso (relación 1:1 con casos_comite).
--   2. Participantes en JSONB (estructura flexible sin tabla extra).
--   3. Tabla separada de casos_comite (separación de responsabilidades).
--   4. Acta puede estar en borrador (firmada = false) o firmada/cerrada.
--   5. Al firmar, se actualiza el estado del caso correspondiente.
--
-- LO QUE HACE:
--   1. Crea tabla actas_comite con relación 1:1 a casos_comite.
--   2. Agrega trigger de updated_at automático.
--   3. Agrega trigger que actualiza casos_comite.decision cuando se firma
--      el acta (solo si decision en el acta != en el caso).
--   4. RLS estándar: auth_all (como las demás tablas — deuda técnica
--      conocida que se endurece antes de pacientes reales).
--
-- LO QUE NO HACE:
--   - No modifica casos_comite (preserva el schema actual).
--   - No genera el PDF (eso es lógica de la app, no de la BD).
--   - No maneja participantes históricos como entidades separadas (eso es
--      lo que aporta el modelo JSONB simple).
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Verificación previa: la tabla no existe ya
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'actas_comite'
  ) THEN
    RAISE EXCEPTION 'ABORT: la tabla actas_comite ya existe. Revisa migración previa.';
  END IF;

  RAISE NOTICE 'OK: actas_comite no existe, procediendo a crearla';
END $$;

-- ============================================================
-- PASO 2 — Crear tabla actas_comite
-- ============================================================

CREATE TABLE actas_comite (
  id                BIGSERIAL PRIMARY KEY,

  -- Relación 1:1 con casos_comite (UNIQUE garantiza 1 acta por caso)
  caso_id           BIGINT NOT NULL UNIQUE
                    REFERENCES casos_comite(id) ON DELETE CASCADE,

  -- ─── Las 4 secciones del acta ────────────────────────────
  resumen_clinico   TEXT,       -- breve resumen del estado del paciente
  discusion         TEXT,       -- discusión del comité (lo que se conversó)
  decision          TEXT,       -- decisión final tomada (narrativa)
  intencion         TEXT        -- intención del tratamiento (selector)
                    CHECK (intencion IS NULL OR intencion IN (
                      'curativa',
                      'paliativa',
                      'neoadyuvante',
                      'adyuvante'
                    )),

  -- ─── Participantes (JSONB) ──────────────────────────────
  -- Estructura esperada:
  -- [
  --   { "nombre": "Dr. X", "rol": "oncologo", "especialidad": "oncologia clinica" },
  --   { "nombre": "Dra. Y", "rol": "moderador", "especialidad": "hematologia" }
  -- ]
  -- Rol sugerido: oncologo | hematologo | radiologo | patologo | cirujano |
  --              farmaceutico | gestor | moderador | invitado | otro
  participantes     JSONB DEFAULT '[]'::JSONB
                    CHECK (jsonb_typeof(participantes) = 'array'),

  -- ─── Estado del acta ─────────────────────────────────────
  firmada           BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_firma       TIMESTAMPTZ,           -- se llena cuando firmada pasa a true
  firmada_por       UUID                   -- usuario que firmó (auth.users.id)
                    REFERENCES auth.users(id) ON DELETE SET NULL,

  -- ─── Decisión que va al caso al cerrar ──────────────────
  -- Esto duplica casos_comite.decision a propósito: aquí guardamos
  -- la decisión del acta. El trigger sincroniza al firmar.
  decision_final    TEXT
                    CHECK (decision_final IS NULL OR decision_final IN (
                      'aprobado',
                      'rechazado',
                      'modificado',
                      'diferido',
                      'pendiente_info'
                    )),

  -- ─── Metadatos ──────────────────────────────────────────
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Comentarios de tabla y columnas (queda en el schema, ayuda al equipo)
COMMENT ON TABLE  actas_comite IS 'Actas formales de la mesa de comité oncológico. Una por caso.';
COMMENT ON COLUMN actas_comite.caso_id          IS 'Caso al que pertenece (UNIQUE = 1:1)';
COMMENT ON COLUMN actas_comite.resumen_clinico  IS 'Resumen clínico del paciente al momento del comité';
COMMENT ON COLUMN actas_comite.discusion        IS 'Texto libre con la discusión del comité';
COMMENT ON COLUMN actas_comite.decision         IS 'Decisión narrativa tomada por el comité';
COMMENT ON COLUMN actas_comite.intencion        IS 'curativa | paliativa | neoadyuvante | adyuvante';
COMMENT ON COLUMN actas_comite.participantes    IS 'Array JSON de participantes (nombre, rol, especialidad)';
COMMENT ON COLUMN actas_comite.firmada          IS 'TRUE = acta cerrada, no editable. FALSE = borrador';
COMMENT ON COLUMN actas_comite.fecha_firma      IS 'Fecha en que se firmó el acta';
COMMENT ON COLUMN actas_comite.decision_final   IS 'Decisión final que se sincroniza con casos_comite.decision al firmar';

-- ============================================================
-- PASO 3 — Índices
-- ============================================================

-- Búsqueda por caso (1:1, pero por si se hacen joins frecuentes)
CREATE INDEX idx_actas_caso_id ON actas_comite(caso_id);

-- Búsqueda por estado (filtrar borradores vs firmadas)
CREATE INDEX idx_actas_firmada ON actas_comite(firmada);

-- Búsqueda por fecha de firma (reportes "actas firmadas este mes")
CREATE INDEX idx_actas_fecha_firma ON actas_comite(fecha_firma)
  WHERE fecha_firma IS NOT NULL;

-- Búsqueda dentro de participantes (queries tipo "actas donde participó Dr. X")
CREATE INDEX idx_actas_participantes ON actas_comite USING GIN (participantes);

-- ============================================================
-- PASO 4 — Trigger de updated_at
-- ============================================================
-- Mantiene updated_at sincronizado al modificar.
-- Reutilizamos la función fn_set_updated_at si ya existe (la creamos
-- en migraciones anteriores). Si no existe, la creamos.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_actas_updated
  BEFORE UPDATE ON actas_comite
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- PASO 5 — Trigger de sincronización al firmar
-- ============================================================
-- Cuando un acta pasa de firmada=FALSE a firmada=TRUE:
--   1. Si fecha_firma es NULL, se llena con now().
--   2. Si firmada_por es NULL y hay un usuario autenticado, se llena.
--   3. Si decision_final tiene valor, se propaga a casos_comite.decision.

CREATE OR REPLACE FUNCTION fn_sync_acta_firmada()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo procesar si pasa a firmada
  IF NEW.firmada = TRUE AND (OLD.firmada = FALSE OR OLD.firmada IS NULL) THEN

    -- 1. Llenar fecha_firma si está vacía
    IF NEW.fecha_firma IS NULL THEN
      NEW.fecha_firma := now();
    END IF;

    -- 2. Llenar firmada_por con el usuario actual si está vacío
    IF NEW.firmada_por IS NULL THEN
      NEW.firmada_por := auth.uid();
    END IF;

    -- 3. Propagar decisión al caso (si hay decisión_final)
    IF NEW.decision_final IS NOT NULL THEN
      UPDATE casos_comite
      SET decision = NEW.decision_final,
          updated_at = now()
      WHERE id = NEW.caso_id
        AND decision <> NEW.decision_final;  -- solo si cambia
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_actas_sync_firmada
  BEFORE UPDATE ON actas_comite
  FOR EACH ROW
  WHEN (NEW.firmada IS DISTINCT FROM OLD.firmada)
  EXECUTE FUNCTION fn_sync_acta_firmada();

-- ============================================================
-- PASO 6 — Row Level Security
-- ============================================================
-- Política estándar auth_all (cualquier usuario autenticado puede ver
-- y modificar). Esta es deuda técnica conocida — antes de pacientes
-- reales hay que endurecer RLS por sede/usuario.

ALTER TABLE actas_comite ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_all ON actas_comite
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PASO 7 — Verificación final
-- ============================================================

DO $$
DECLARE
  v_tabla_existe INT;
  v_indices INT;
  v_triggers INT;
  v_rls BOOLEAN;
BEGIN
  -- Tabla creada
  SELECT COUNT(*) INTO v_tabla_existe
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'actas_comite';

  IF v_tabla_existe <> 1 THEN
    RAISE EXCEPTION 'ABORT: tabla actas_comite no se creó';
  END IF;

  -- Índices (4 esperados: 1 PK + 4 que creamos)
  SELECT COUNT(*) INTO v_indices
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'actas_comite';

  IF v_indices < 5 THEN
    RAISE EXCEPTION 'ABORT: se esperaban al menos 5 índices, hay %', v_indices;
  END IF;

  -- Triggers (2 esperados)
  SELECT COUNT(*) INTO v_triggers
  FROM pg_trigger
  WHERE tgrelid = 'actas_comite'::regclass AND NOT tgisinternal;

  IF v_triggers < 2 THEN
    RAISE EXCEPTION 'ABORT: se esperaban 2 triggers, hay %', v_triggers;
  END IF;

  -- RLS habilitado
  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE relname = 'actas_comite';

  IF NOT v_rls THEN
    RAISE EXCEPTION 'ABORT: RLS no quedó habilitado';
  END IF;

  RAISE NOTICE '════════ MIGRACION 005 COMPLETADA ════════';
  RAISE NOTICE 'Tabla actas_comite creada';
  RAISE NOTICE 'Índices: %', v_indices;
  RAISE NOTICE 'Triggers: %', v_triggers;
  RAISE NOTICE 'RLS habilitado: %', v_rls;
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL POST-MIGRACIÓN
-- ============================================================
--
--   -- Estructura de la tabla
--   \d actas_comite
--
--   -- Triggers activos
--   SELECT tgname,
--          CASE tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'DISABLED' END
--   FROM pg_trigger
--   WHERE tgrelid = 'actas_comite'::regclass AND NOT tgisinternal;
--
--   -- Test rápido: crear un acta para un caso existente
--   INSERT INTO actas_comite (caso_id, resumen_clinico, intencion)
--   VALUES (1, 'Test', 'curativa');
--   SELECT * FROM actas_comite WHERE caso_id = 1;
--   DELETE FROM actas_comite WHERE caso_id = 1;
-- ============================================================
