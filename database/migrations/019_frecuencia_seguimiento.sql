-- ============================================================
-- SGICO: Migración 019 — Frecuencia de seguimiento por paciente
-- ============================================================
--
-- ANTES: al aprobar un caso se creaba de una vez un calendario fijo
--   (post-comité + 4 trimestrales + semestral + anual).
--
-- AHORA (ajuste de la reunión con el cliente):
--   - casos_comite.frecuencia_seguimiento: trimestral | cuatrimestral | semestral
--     (se elige en la mesa al aprobar; por defecto trimestral).
--   - Al aprobar: siempre el post-comité (+7 días) y el primer control
--     según la frecuencia.
--   - Al registrar un control, se programa el siguiente con la frecuencia
--     vigente, mientras el caso siga activo/en tratamiento y el paciente
--     no haya progresado, fallecido, terminado tratamiento o se haya perdido.
--   - cambiar_frecuencia_seguimiento(caso, frecuencia): cambia la frecuencia
--     y reprograma el control pendiente.
--   - seguimientos.numero: número consecutivo del control periódico.
--
-- Los seguimientos ya creados con el calendario anterior se conservan.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

-- 1. Columnas ------------------------------------------------------------
ALTER TABLE casos_comite
  ADD COLUMN IF NOT EXISTS frecuencia_seguimiento varchar NOT NULL DEFAULT 'trimestral';

ALTER TABLE casos_comite DROP CONSTRAINT IF EXISTS casos_comite_frecuencia_seguimiento_check;
ALTER TABLE casos_comite ADD CONSTRAINT casos_comite_frecuencia_seguimiento_check
  CHECK (frecuencia_seguimiento IN ('trimestral', 'cuatrimestral', 'semestral'));

COMMENT ON COLUMN casos_comite.frecuencia_seguimiento IS 'Frecuencia de los controles periódicos tras la aprobación: trimestral, cuatrimestral o semestral.';

ALTER TABLE seguimientos ADD COLUMN IF NOT EXISTS numero integer;
COMMENT ON COLUMN seguimientos.numero IS 'Número consecutivo del control periódico (no aplica al post-comité).';

-- Tipos nuevos: 'trimestral' y 'cuatrimestral' ('semestral' ya existía)
ALTER TABLE seguimientos DROP CONSTRAINT IF EXISTS seguimientos_tipo_check;
ALTER TABLE seguimientos ADD CONSTRAINT seguimientos_tipo_check CHECK (tipo IN (
  'post_comite',
  'trimestral_1', 'trimestral_2', 'trimestral_3', 'trimestral_4',
  'semestral', 'anual', 'ad_hoc',
  'trimestral', 'cuatrimestral'
));

-- 2. Meses por frecuencia -------------------------------------------------
CREATE OR REPLACE FUNCTION public.meses_frecuencia(p_frecuencia varchar) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE p_frecuencia
           WHEN 'cuatrimestral' THEN 4
           WHEN 'semestral'     THEN 6
           ELSE 3
         END;
$$;

-- 3. Al aprobar: post-comité + primer control ------------------------------
CREATE OR REPLACE FUNCTION public.crear_seguimientos_auto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_base date;
BEGIN
    IF NEW.decision IN ('aprobado', 'modificado') AND
       (TG_OP = 'INSERT' OR OLD.decision IS NULL OR OLD.decision NOT IN ('aprobado', 'modificado')) THEN

        v_base := COALESCE(NEW.fecha_presentacion, CURRENT_DATE);

        INSERT INTO seguimientos (caso_id, tipo, numero, fecha_programada) VALUES
          (NEW.id, 'post_comite', NULL, v_base + 7),
          (NEW.id, NEW.frecuencia_seguimiento, 1,
           (v_base + make_interval(months => meses_frecuencia(NEW.frecuencia_seguimiento)))::date);
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Al registrar un control: programar el siguiente -----------------------
CREATE OR REPLACE FUNCTION public.programar_siguiente_evaluacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_caso casos_comite%ROWTYPE;
    v_n    int;
BEGIN
    IF NEW.estado = 'realizado' AND OLD.estado != 'realizado' THEN
        SELECT * INTO v_caso FROM casos_comite WHERE id = NEW.caso_id;

        IF v_caso.estado IN ('activo', 'en_tratamiento')
           AND NEW.tipo != 'post_comite'
           AND (NEW.estado_clinico IS NULL OR NEW.estado_clinico NOT IN ('progresion', 'fallecido', 'perdido', 'fin_tratamiento'))
           -- Solo si no queda ya un control abierto (p. ej. del calendario anterior)
           AND NOT EXISTS (SELECT 1 FROM seguimientos
                            WHERE caso_id = NEW.caso_id AND id <> NEW.id
                              AND tipo != 'post_comite' AND estado IN ('pendiente', 'vencido')) THEN

            SELECT COUNT(*) INTO v_n FROM seguimientos
             WHERE caso_id = NEW.caso_id AND tipo != 'post_comite';

            INSERT INTO seguimientos (caso_id, tipo, numero, fecha_programada)
            VALUES (NEW.caso_id, v_caso.frecuencia_seguimiento, v_n + 1,
                    (COALESCE(NEW.fecha_realizada, CURRENT_DATE)
                      + make_interval(months => meses_frecuencia(v_caso.frecuencia_seguimiento)))::date);
        END IF;

        IF NEW.estado_clinico = 'progresion' THEN
            UPDATE casos_comite SET estado = 'progresion' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico = 'fallecido' THEN
            UPDATE casos_comite SET estado = 'fallecido' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico = 'perdido' THEN
            UPDATE casos_comite SET estado = 'perdido' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico IN ('en_tratamiento', 'respuesta_parcial', 'respuesta_completa', 'enfermedad_estable') THEN
            UPDATE casos_comite SET estado = 'en_tratamiento' WHERE id = NEW.caso_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 5. Cambiar la frecuencia de un paciente y reprogramar -------------------
CREATE OR REPLACE FUNCTION public.cambiar_frecuencia_seguimiento(p_caso_id integer, p_frecuencia varchar)
RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_caso casos_comite%ROWTYPE;
    v_base date;
    v_n    int;
BEGIN
    IF p_frecuencia NOT IN ('trimestral', 'cuatrimestral', 'semestral') THEN
        RAISE EXCEPTION 'Frecuencia no válida: %', p_frecuencia;
    END IF;

    UPDATE casos_comite SET frecuencia_seguimiento = p_frecuencia
     WHERE id = p_caso_id
     RETURNING * INTO v_caso;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caso % no encontrado', p_caso_id;
    END IF;

    -- Los controles abiertos se reemplazan por uno con la nueva frecuencia
    DELETE FROM seguimientos
     WHERE caso_id = p_caso_id AND tipo != 'post_comite' AND estado IN ('pendiente', 'vencido');

    IF v_caso.decision IN ('aprobado', 'modificado')
       AND v_caso.estado IN ('activo', 'en_tratamiento') THEN

        -- Desde el último control realizado (o la presentación si aún no hay)
        SELECT MAX(fecha_realizada) INTO v_base FROM seguimientos
         WHERE caso_id = p_caso_id AND tipo != 'post_comite' AND estado = 'realizado';
        v_base := COALESCE(v_base, v_caso.fecha_presentacion, CURRENT_DATE);

        SELECT COUNT(*) INTO v_n FROM seguimientos
         WHERE caso_id = p_caso_id AND tipo != 'post_comite';

        INSERT INTO seguimientos (caso_id, tipo, numero, fecha_programada)
        VALUES (p_caso_id, p_frecuencia, v_n + 1,
                (v_base + make_interval(months => meses_frecuencia(p_frecuencia)))::date);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cambiar_frecuencia_seguimiento(integer, varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meses_frecuencia(varchar) TO authenticated;

-- 6. Verificación ---------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='casos_comite' AND column_name='frecuencia_seguimiento') THEN
    RAISE EXCEPTION 'Migración 019: falta casos_comite.frecuencia_seguimiento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='seguimientos' AND column_name='numero') THEN
    RAISE EXCEPTION 'Migración 019: falta seguimientos.numero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cambiar_frecuencia_seguimiento') THEN
    RAISE EXCEPTION 'Migración 019: falta cambiar_frecuencia_seguimiento()';
  END IF;
  RAISE NOTICE 'Migración 019 OK';
END $$;

COMMIT;
