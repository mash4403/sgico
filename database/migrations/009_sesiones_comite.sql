-- ============================================================
-- SGICO: Migración 009 — Sesiones de comité y agenda de casos
-- ============================================================
--
-- OBJETIVO: los casos se preparan días antes del comité. Hoy el "borrador"
-- vive solo en localStorage del navegador y no hay fecha de comité ni lista.
-- Se introduce el comité como EVENTO real (sesión con fecha) al que se
-- AGENDAN casos; una vez presentados, pasan al flujo normal de "Casos".
--
-- DECISIONES DE DISEÑO (acordadas con el usuario):
--   - Modelo de "sesiones de comité" (no fecha suelta por caso): tabla
--     sesiones_comite (fecha, tipo, estado) con casos asignados vía sesion_id.
--   - Estado de agenda SEPARADO del estado clínico: casos_comite.estado es
--     clínico (activo/en_tratamiento/...) y NO se toca. Se usa la bandera
--     nueva casos_comite.presentado para el ciclo de agenda.
--   - "Agendar incompleto" permitido: se relaja motivo a NULL y el estado
--     del formulario se guarda en casos_comite.borrador_data (jsonb) para
--     rehidratar sin pérdida al reabrir un caso agendado.
--
-- VERIFICACIÓN PREVIA:
--   - casos_comite.estado tiene CHECK clínico (sin 'agendado') → por eso NO
--     se usa estado para la agenda.
--   - tipo_comite válido: tumor_solido / hematologico / multidisciplinario.
--
-- LO QUE HACE:
--   1. Crea sesiones_comite (+ RLS auth_all + grants, como el resto).
--   2. Agrega a casos_comite: sesion_id (FK), presentado (bool), borrador_data (jsonb).
--   3. Relaja casos_comite.motivo a NULL (permitir agendar incompleto).
--   4. Backfill: casos existentes → presentado = true (ya pasaron por comité).
--
-- LO QUE NO HACE:
--   - No toca casos_comite.estado ni sus CHECKs.
--   - No borra datos.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- PASO 1 — Tabla sesiones_comite
-- ============================================================

CREATE TABLE IF NOT EXISTS sesiones_comite (
  id          serial PRIMARY KEY,
  fecha       date NOT NULL,
  tipo_comite varchar NOT NULL DEFAULT 'tumor_solido'
              CHECK (tipo_comite IN ('tumor_solido', 'hematologico', 'multidisciplinario')),
  estado      varchar NOT NULL DEFAULT 'programada'
              CHECK (estado IN ('programada', 'realizada', 'cerrada')),
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sesiones_comite IS 'Sesión de comité oncológico (evento con fecha). Los casos se agendan a una sesión vía casos_comite.sesion_id.';

-- RLS + grants (mismo modelo que las tablas núcleo: authenticated full access)
ALTER TABLE sesiones_comite ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sesiones_comite' AND policyname = 'auth_all'
  ) THEN
    CREATE POLICY auth_all ON sesiones_comite FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON sesiones_comite TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE sesiones_comite_id_seq TO authenticated;

-- ============================================================
-- PASO 2 — Columnas de agenda en casos_comite
-- ============================================================

ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS sesion_id     integer REFERENCES sesiones_comite(id),
  ADD COLUMN IF NOT EXISTS presentado    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS borrador_data jsonb;

CREATE INDEX IF NOT EXISTS idx_casos_comite_sesion ON casos_comite(sesion_id);
CREATE INDEX IF NOT EXISTS idx_casos_comite_presentado ON casos_comite(presentado);

COMMENT ON COLUMN casos_comite.sesion_id     IS 'Sesión de comité a la que está agendado el caso (NULL = no agendado).';
COMMENT ON COLUMN casos_comite.presentado    IS 'FALSE = agendado (en la agenda del comité); TRUE = ya presentado, aparece en Casos.';
COMMENT ON COLUMN casos_comite.borrador_data IS 'Snapshot jsonb del formulario para rehidratar sin pérdida un caso agendado en edición.';

-- ============================================================
-- PASO 3 — Permitir agendar incompleto (motivo nullable)
-- ============================================================

ALTER TABLE casos_comite ALTER COLUMN motivo DROP NOT NULL;

-- ============================================================
-- PASO 4 — Backfill: casos existentes ya están presentados
-- ============================================================

ALTER TABLE casos_comite DISABLE TRIGGER USER;  -- evita ruido del trigger de auditoría
UPDATE casos_comite SET presentado = true WHERE presentado = false;
ALTER TABLE casos_comite ENABLE TRIGGER USER;

-- ============================================================
-- PASO 5 — Verificación final
-- ============================================================

DO $$
DECLARE v_cols int; v_tbl int;
BEGIN
  SELECT COUNT(*) INTO v_tbl FROM information_schema.tables
   WHERE table_schema='public' AND table_name='sesiones_comite';
  IF v_tbl <> 1 THEN RAISE EXCEPTION 'ABORT: sesiones_comite no se creó'; END IF;

  SELECT COUNT(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='casos_comite'
     AND column_name IN ('sesion_id','presentado','borrador_data');
  IF v_cols <> 3 THEN RAISE EXCEPTION 'ABORT: faltan columnas de agenda (hay %)', v_cols; END IF;

  RAISE NOTICE '════════ MIGRACION 009 COMPLETADA ════════';
  RAISE NOTICE '  Tabla sesiones_comite + RLS auth_all';
  RAISE NOTICE '  casos_comite: sesion_id, presentado, borrador_data';
  RAISE NOTICE '  motivo ahora nullable · backfill presentado=true';
  RAISE NOTICE '═════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN MANUAL
-- ============================================================
--   SELECT count(*) FROM casos_comite WHERE presentado;      -- todos los actuales
--   SELECT * FROM sesiones_comite;                           -- vacía por ahora
-- ============================================================
