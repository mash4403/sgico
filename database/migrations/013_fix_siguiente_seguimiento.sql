-- ============================================================
-- SGICO: Migración 013 — Fix calendario de seguimientos (tipo_check)
-- ============================================================
--
-- BUG: al registrar un seguimiento, el trigger programar_siguiente_evaluacion
-- cuenta los trimestrales y crea 'trimestral_' || (n+1). Tras el 4º, genera
-- 'trimestral_5', que NO está permitido por seguimientos_tipo_check
-- (solo trimestral_1..4, semestral, anual, ad_hoc) → ERROR al guardar.
--
-- FIX: seguir el calendario clínico real: 4 trimestrales (año 1) →
-- semestral → anual → detener. Nunca genera un tipo fuera del CHECK.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.programar_siguiente_evaluacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    caso_estado VARCHAR(30);
    n_trim INT;
    siguiente_tipo VARCHAR(20);
    siguiente_fecha DATE;
BEGIN
    IF NEW.estado = 'realizado' AND OLD.estado != 'realizado' THEN
        SELECT estado INTO caso_estado FROM casos_comite WHERE id = NEW.caso_id;

        IF caso_estado IN ('activo','en_tratamiento')
           AND NEW.tipo != 'post_comite'
           AND (NEW.estado_clinico IS NULL OR NEW.estado_clinico NOT IN ('progresion','fallecido','perdido','fin_tratamiento')) THEN

            SELECT COUNT(*) INTO n_trim
            FROM seguimientos WHERE caso_id = NEW.caso_id AND tipo LIKE 'trimestral_%';

            IF n_trim < 4 THEN
                siguiente_tipo  := 'trimestral_' || (n_trim + 1);
                siguiente_fecha := (NEW.fecha_realizada + INTERVAL '3 months')::date;
            ELSIF NOT EXISTS (SELECT 1 FROM seguimientos WHERE caso_id = NEW.caso_id AND tipo = 'semestral') THEN
                siguiente_tipo  := 'semestral';
                siguiente_fecha := (NEW.fecha_realizada + INTERVAL '6 months')::date;
            ELSIF NOT EXISTS (SELECT 1 FROM seguimientos WHERE caso_id = NEW.caso_id AND tipo = 'anual') THEN
                siguiente_tipo  := 'anual';
                siguiente_fecha := (NEW.fecha_realizada + INTERVAL '12 months')::date;
            ELSE
                siguiente_tipo  := NULL; -- calendario completo, no se agenda más
            END IF;

            IF siguiente_tipo IS NOT NULL THEN
                INSERT INTO seguimientos (caso_id, tipo, fecha_programada)
                VALUES (NEW.caso_id, siguiente_tipo, siguiente_fecha);
            END IF;
        END IF;

        IF NEW.estado_clinico = 'progresion' THEN
            UPDATE casos_comite SET estado = 'progresion' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico = 'fallecido' THEN
            UPDATE casos_comite SET estado = 'fallecido' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico = 'perdido' THEN
            UPDATE casos_comite SET estado = 'perdido' WHERE id = NEW.caso_id;
        ELSIF NEW.estado_clinico IN ('en_tratamiento','respuesta_parcial','respuesta_completa','enfermedad_estable') THEN
            UPDATE casos_comite SET estado = 'en_tratamiento' WHERE id = NEW.caso_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
