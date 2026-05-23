-- ============================================================
-- SGICO — Baseline Schema (Migración 001)
-- ============================================================
--
-- Esta es la baseline del schema de la BD de producción.
-- Capturada con pg_dump --schema-only el 2026-05-19 desde Supabase
-- (proyecto en us-west-2, Oregon).
--
-- Contiene:
--   - 13 tablas (catálogos + dominio clínico + auditoría)
--   - 5 vistas KPI
--   - 5 funciones (triggers de auditoría, seguimientos, etc.)
--   - 5 triggers activos
--   - 19 índices
--   - 16 políticas RLS
--
-- Reemplaza las migraciones previas (001 original, 002, 003)
-- que quedaron obsoletas y fueron consolidadas aquí.
--
-- Cualquier cambio adicional debe ir en migraciones nuevas:
-- 002_*.sql, 003_*.sql, etc.
--
-- Cómo aplicar en un proyecto vacío:
--   1. Crear proyecto Supabase nuevo
--   2. SQL Editor → pegar este archivo completo → Run
--   3. Aplicar database/seeds/001_catalogos.sql (EPS, sedes, protocolos)
--   4. Aplicar migraciones posteriores en orden numérico
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

--
-- Name: crear_seguimientos_auto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_seguimientos_auto() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;

--
-- Name: fn_log_caso_cambio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_caso_cambio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_cambios     JSONB := '{}'::jsonb;
  v_snapshot    JSONB := '{}'::jsonb;
  v_user_id     UUID;
  v_user_email  TEXT;
  v_campo       TEXT;
  v_new_row     JSONB;
  v_old_row     JSONB;
  -- Whitelist de campos auditables. Incluye flujo de creación,
  -- decisión, cierre administrativo y campos clínicos.
  c_campos      CONSTANT TEXT[] := ARRAY[
    -- Relacionales y administrativos
    'paciente_id', 'sede_id', 'medico_id', 'gestor_id',
    'diagnostico_id', 'protocolo_id',
    'fecha_solicitud', 'fecha_presentacion',
    'tipo_comite', 'prioridad', 'estado',
    -- Clínicos: diagnóstico
    'diagnostico_descripcion', 'histologia', 'estadio_clinico', 'tnm',
    'fecha_diagnostico', 'biomarcadores',
    -- Clínicos: estado funcional y antecedentes
    'ecog', 'comorbilidades', 'alergias',
    'habito_tabaquico', 'habito_alcohol', 'medicacion_actual',
    -- Estudios
    'estudios_imagenes', 'estudios_laboratorio',
    'estudios_patologia', 'estudios_moleculares', 'fecha_ultimo_estudio',
    -- Tratamientos previos
    'tratamiento_previo', 'molecula_previa', 'linea_actual',
    'tratamiento_quirurgico', 'tratamiento_qt', 'tratamiento_rt',
    'tratamiento_dirigido', 'respuesta_previa',
    -- Evidencia
    'evidencia_referencia', 'evidencia_tipo', 'evidencia_link',
    'pfs_esperado_estudio', 'os_esperado_estudio',
    -- Propuesta y narrativa
    'motivo', 'justificacion', 'molecula_propuesta', 'linea_propuesta',
    'pregunta_comite', 'tratamiento_propuesto', 'justificacion_clinica',
    -- Regulatorio
    'tiene_invima', 'en_unirse', 'presentacion_obligatoria',
    -- Economía
    'costo_previo', 'costo_estimado', 'costo_post',
    'costo_molecula_aprobada', 'proyeccion_costos',
    -- Decisión del comité
    'decision', 'molecula_aprobada', 'justificacion_decision',
    'adherente_protocolo', 'motivo_no_adherencia',
    -- Cierre
    'valoracion_psicosocial', 'motivo_cancelacion',
    -- Adjuntos
    'adjuntos'
  ];
BEGIN
  -- Capturar usuario actual
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Snapshot de los valores con los que se creó el caso (solo no-nulos)
    v_new_row := row_to_json(NEW)::jsonb;
    FOREACH v_campo IN ARRAY c_campos LOOP
      IF v_new_row -> v_campo IS NOT NULL
         AND v_new_row ->> v_campo <> ''
         AND v_new_row -> v_campo <> 'null'::jsonb THEN
        v_snapshot := v_snapshot || jsonb_build_object(
          v_campo,
          jsonb_build_object(
            'antes',   NULL,
            'despues', v_new_row -> v_campo
          )
        );
      END IF;
    END LOOP;

    INSERT INTO casos_historial (caso_id, accion, cambios, usuario_id, usuario_email)
    VALUES (
      NEW.id,
      'crear',
      CASE WHEN v_snapshot = '{}'::jsonb THEN NULL ELSE v_snapshot END,
      v_user_id,
      v_user_email
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_new_row := row_to_json(NEW)::jsonb;
    v_old_row := row_to_json(OLD)::jsonb;

    FOREACH v_campo IN ARRAY c_campos LOOP
      IF v_new_row -> v_campo IS DISTINCT FROM v_old_row -> v_campo THEN
        v_cambios := v_cambios || jsonb_build_object(
          v_campo,
          jsonb_build_object(
            'antes',   v_old_row -> v_campo,
            'despues', v_new_row -> v_campo
          )
        );
      END IF;
    END LOOP;

    IF v_cambios <> '{}'::jsonb THEN
      INSERT INTO casos_historial (caso_id, accion, cambios, usuario_id, usuario_email)
      VALUES (NEW.id, 'actualizar', v_cambios, v_user_id, v_user_email);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO casos_historial (caso_id, accion, cambios, usuario_id, usuario_email)
    VALUES (OLD.id, 'eliminar', NULL, v_user_id, v_user_email);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

--
-- Name: marcar_seguimientos_vencidos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_seguimientos_vencidos() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE seguimientos SET estado = 'vencido'
    WHERE estado = 'pendiente' AND fecha_programada < CURRENT_DATE;
    
    INSERT INTO alertas (caso_id, tipo, mensaje, prioridad)
    SELECT s.caso_id,
           CASE WHEN s.tipo = 'post_comite' THEN 'evaluacion_post_comite_vencida'
                ELSE 'evaluacion_trimestral_vencida' END,
           CASE WHEN s.tipo = 'post_comite' THEN 'Evaluación post-comité vencida desde ' || s.fecha_programada
                ELSE 'Evaluación ' || REPLACE(s.tipo, '_', ' ') || ' vencida desde ' || s.fecha_programada END,
           'alta'
    FROM seguimientos s
    WHERE s.estado = 'vencido'
      AND NOT EXISTS (
          SELECT 1 FROM alertas a 
          WHERE a.caso_id = s.caso_id 
            AND a.estado = 'activa'
            AND a.created_at > s.fecha_programada
      );
END;
$$;

--
-- Name: programar_siguiente_evaluacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.programar_siguiente_evaluacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    caso_estado VARCHAR(30);
    siguiente_num INT;
BEGIN
    IF NEW.estado = 'realizado' AND OLD.estado != 'realizado' THEN
        SELECT estado INTO caso_estado FROM casos_comite WHERE id = NEW.caso_id;
        
        IF caso_estado IN ('activo','en_tratamiento') 
           AND NEW.tipo != 'post_comite'
           AND (NEW.estado_clinico IS NULL OR NEW.estado_clinico NOT IN ('progresion','fallecido','perdido','fin_tratamiento')) THEN
            
            SELECT COUNT(*) + 1 INTO siguiente_num 
            FROM seguimientos WHERE caso_id = NEW.caso_id AND tipo LIKE 'trimestral_%';
            
            INSERT INTO seguimientos (caso_id, tipo, fecha_programada)
            VALUES (NEW.caso_id, 'trimestral_' || siguiente_num, NEW.fecha_realizada + INTERVAL '3 months');
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

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas (
    id integer NOT NULL,
    caso_id integer,
    tipo character varying(50) NOT NULL,
    mensaje text,
    prioridad character varying(10) DEFAULT 'media'::character varying,
    estado character varying(20) DEFAULT 'activa'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    resuelta_at timestamp with time zone,
    resuelta_por integer,
    CONSTRAINT alertas_estado_check CHECK (((estado)::text = ANY ((ARRAY['activa'::character varying, 'resuelta'::character varying, 'descartada'::character varying])::text[]))),
    CONSTRAINT alertas_prioridad_check CHECK (((prioridad)::text = ANY ((ARRAY['alta'::character varying, 'media'::character varying, 'baja'::character varying])::text[])))
);

--
-- Name: alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alertas_id_seq OWNED BY public.alertas.id;

--
-- Name: casos_comite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casos_comite (
    id integer NOT NULL,
    paciente_id integer,
    diagnostico_id integer,
    medico_id integer,
    sede_id integer,
    fecha_solicitud date NOT NULL,
    tipo_comite character varying(50) DEFAULT 'tumor_solido'::character varying,
    motivo text NOT NULL,
    linea_actual integer,
    linea_propuesta integer,
    tratamiento_previo text,
    molecula_previa character varying(200),
    costo_previo numeric(15,2) DEFAULT 0,
    molecula_propuesta character varying(200),
    justificacion text,
    tiene_invima boolean DEFAULT false,
    en_unirse boolean DEFAULT false,
    protocolo_id integer,
    presentacion_obligatoria boolean DEFAULT false,
    fecha_presentacion date,
    oportunidad_dias integer GENERATED ALWAYS AS (
CASE
    WHEN (fecha_presentacion IS NOT NULL) THEN (fecha_presentacion - fecha_solicitud)
    ELSE NULL::integer
END) STORED,
    decision character varying(50) DEFAULT 'pendiente'::character varying,
    molecula_aprobada character varying(200),
    justificacion_decision text,
    adherente_protocolo boolean,
    motivo_no_adherencia text,
    costo_molecula_aprobada numeric(15,2) DEFAULT 0,
    costo_post numeric(15,2) DEFAULT 0,
    diferencia_costo numeric(15,2) GENERATED ALWAYS AS ((costo_post - costo_previo)) STORED,
    valoracion_psicosocial boolean DEFAULT false,
    estado character varying(30) DEFAULT 'activo'::character varying,
    motivo_cancelacion text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    diagnostico_descripcion text,
    histologia character varying(300),
    estadio_clinico character varying(20),
    tnm character varying(20),
    fecha_diagnostico date,
    biomarcadores text,
    ecog character varying(2),
    comorbilidades text,
    alergias text,
    habito_tabaquico character varying(20),
    habito_alcohol character varying(20),
    medicacion_actual text,
    estudios_imagenes text,
    estudios_laboratorio text,
    estudios_patologia text,
    estudios_moleculares text,
    fecha_ultimo_estudio date,
    tratamiento_quirurgico text,
    tratamiento_qt text,
    tratamiento_rt text,
    tratamiento_dirigido text,
    respuesta_previa text,
    evidencia_referencia character varying(300),
    evidencia_tipo character varying(30),
    evidencia_link text,
    pfs_esperado_estudio numeric(6,2),
    os_esperado_estudio numeric(6,2),
    pregunta_comite text,
    tratamiento_propuesto text,
    justificacion_clinica text,
    costo_estimado numeric(15,2),
    adjuntos jsonb DEFAULT '[]'::jsonb,
    prioridad character varying(20) DEFAULT 'normal'::character varying,
    gestor_id integer,
    proyeccion_costos jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT casos_comite_decision_check CHECK (((decision)::text = ANY ((ARRAY['pendiente'::character varying, 'aprobado'::character varying, 'rechazado'::character varying, 'modificado'::character varying, 'diferido'::character varying, 'pendiente_info'::character varying])::text[]))),
    CONSTRAINT casos_comite_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'en_tratamiento'::character varying, 'completado'::character varying, 'progresion'::character varying, 'cancelado'::character varying, 'fallecido'::character varying, 'perdido'::character varying])::text[]))),
    CONSTRAINT casos_comite_evidencia_tipo_check CHECK (((evidencia_tipo IS NULL) OR ((evidencia_tipo)::text = ANY ((ARRAY['fase_3'::character varying, 'fase_2'::character varying, 'fase_1'::character varying, 'metanalisis'::character varying, 'revision_sistematica'::character varying, 'guia'::character varying, 'consenso'::character varying, 'real_world'::character varying, 'reporte_caso'::character varying, 'otro'::character varying])::text[])))),
    CONSTRAINT casos_comite_prioridad_check CHECK (((prioridad IS NULL) OR ((prioridad)::text = ANY ((ARRAY['normal'::character varying, 'urgente'::character varying, 'critica'::character varying])::text[])))),
    CONSTRAINT casos_tipo_comite_chk CHECK (((tipo_comite)::text = ANY ((ARRAY['tumor_solido'::character varying, 'hematologico'::character varying, 'multidisciplinario'::character varying])::text[])))
);

--
-- Name: casos_comite_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casos_comite_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: casos_comite_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casos_comite_id_seq OWNED BY public.casos_comite.id;

--
-- Name: casos_historial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casos_historial (
    id bigint NOT NULL,
    caso_id integer NOT NULL,
    accion character varying(20) NOT NULL,
    cambios jsonb,
    usuario_id uuid,
    usuario_email character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT casos_historial_accion_check CHECK (((accion)::text = ANY ((ARRAY['crear'::character varying, 'actualizar'::character varying, 'eliminar'::character varying])::text[])))
);

--
-- Name: casos_historial_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casos_historial_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: casos_historial_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casos_historial_id_seq OWNED BY public.casos_historial.id;

--
-- Name: desenlaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desenlaces (
    id integer NOT NULL,
    paciente_id integer,
    caso_id integer,
    mejor_respuesta character varying(5),
    fecha_mejor_respuesta date,
    fecha_inicio_tx date,
    fecha_progresion date,
    pfs_meses numeric(5,1),
    evento_pfs boolean DEFAULT false,
    fecha_muerte date,
    os_meses numeric(5,1),
    evento_os boolean DEFAULT false,
    causa_muerte character varying(100),
    toxicidad_max integer,
    toxicidad_descripcion text,
    suspension_toxicidad boolean DEFAULT false,
    protocolo_id integer,
    pfs_esperado numeric(5,1),
    os_esperado numeric(5,1),
    avac_estimado numeric(5,2),
    costo_total numeric(15,2),
    costo_avac numeric(15,2),
    estado_vital character varying(20) DEFAULT 'vivo'::character varying,
    fecha_ultimo_contacto date,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT desenlaces_estado_vital_check CHECK (((estado_vital)::text = ANY ((ARRAY['vivo'::character varying, 'fallecido'::character varying, 'perdido'::character varying])::text[]))),
    CONSTRAINT desenlaces_mejor_respuesta_check CHECK (((mejor_respuesta)::text = ANY ((ARRAY['RC'::character varying, 'RP'::character varying, 'EE'::character varying, 'PE'::character varying, 'NE'::character varying])::text[]))),
    CONSTRAINT desenlaces_toxicidad_max_check CHECK (((toxicidad_max >= 0) AND (toxicidad_max <= 5)))
);

--
-- Name: desenlaces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.desenlaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: desenlaces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.desenlaces_id_seq OWNED BY public.desenlaces.id;

--
-- Name: diagnosticos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosticos (
    id integer NOT NULL,
    paciente_id integer,
    cie10 character varying(10) NOT NULL,
    descripcion character varying(300),
    estadio character varying(20),
    perfil_molecular jsonb DEFAULT '{}'::jsonb,
    histologia character varying(200),
    fecha_diagnostico date,
    metastasis_sitios text,
    ecog integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT diagnosticos_ecog_check CHECK (((ecog >= 0) AND (ecog <= 5)))
);

--
-- Name: diagnosticos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnosticos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: diagnosticos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnosticos_id_seq OWNED BY public.diagnosticos.id;

--
-- Name: eps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eps (
    id integer NOT NULL,
    nombre character varying(150) NOT NULL,
    codigo character varying(20),
    activa boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: eps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: eps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eps_id_seq OWNED BY public.eps.id;

--
-- Name: gestores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gestores (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    email character varying(200),
    rol character varying(50) DEFAULT 'gestor_seguimiento'::character varying,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: gestores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gestores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: gestores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gestores_id_seq OWNED BY public.gestores.id;

--
-- Name: medicamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicamentos (
    id integer NOT NULL,
    caso_id integer,
    momento character varying(10) NOT NULL,
    nombre character varying(200) NOT NULL,
    forma_farmaceutica character varying(100),
    concentracion character varying(100),
    dosis character varying(100),
    cantidad numeric(10,2),
    valor_unitario numeric(15,2) DEFAULT 0,
    valor_total numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT medicamentos_momento_check CHECK (((momento)::text = ANY ((ARRAY['antes'::character varying, 'despues'::character varying])::text[])))
);

--
-- Name: medicamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: medicamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicamentos_id_seq OWNED BY public.medicamentos.id;

--
-- Name: medicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicos (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    especialidad character varying(100),
    registro_medico character varying(30),
    sede_id integer,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: medicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: medicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicos_id_seq OWNED BY public.medicos.id;

--
-- Name: pacientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pacientes (
    id integer NOT NULL,
    tipo_documento character varying(5) NOT NULL,
    documento character varying(20) NOT NULL,
    nombre character varying(200) NOT NULL,
    genero character(1),
    fecha_nacimiento date,
    telefono1 character varying(20),
    telefono2 character varying(20),
    eps_id integer,
    sede_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pacientes_genero_check CHECK ((genero = ANY (ARRAY['M'::bpchar, 'F'::bpchar, 'O'::bpchar]))),
    CONSTRAINT pacientes_tipo_documento_check CHECK (((tipo_documento)::text = ANY ((ARRAY['CC'::character varying, 'TI'::character varying, 'CE'::character varying, 'PA'::character varying, 'RC'::character varying, 'NIT'::character varying, 'PT'::character varying])::text[])))
);

--
-- Name: pacientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pacientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: pacientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pacientes_id_seq OWNED BY public.pacientes.id;

--
-- Name: protocolos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protocolos (
    id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    cie10 character varying(10),
    diagnostico character varying(200),
    linea_tratamiento integer,
    regimen_estandar text,
    moleculas_protocolo jsonb DEFAULT '[]'::jsonb,
    pfs_esperado_meses numeric(5,1),
    os_esperado_meses numeric(5,1),
    estudio_pivotal character varying(200),
    referencia text,
    requiere_comite boolean DEFAULT true,
    fecha_vigencia date,
    version integer DEFAULT 1,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: protocolos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.protocolos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: protocolos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.protocolos_id_seq OWNED BY public.protocolos.id;

--
-- Name: sedes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sedes (
    id integer NOT NULL,
    nombre character varying(100) NOT NULL,
    ciudad character varying(50) DEFAULT 'Medellín'::character varying,
    activa boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: sedes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sedes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: sedes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sedes_id_seq OWNED BY public.sedes.id;

--
-- Name: seguimientos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguimientos (
    id integer NOT NULL,
    caso_id integer,
    tipo character varying(20) NOT NULL,
    fecha_programada date NOT NULL,
    fecha_realizada date,
    gestor_id integer,
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    decision_ejecutada boolean,
    fecha_primera_consulta date,
    fecha_inicio_tratamiento date,
    motivo_no_ejecucion text,
    estado_clinico character varying(30),
    respuesta_recist character varying(5),
    pfs_alcanzado boolean DEFAULT false,
    fecha_progresion date,
    sitio_progresion text,
    os_alcanzado boolean DEFAULT false,
    fecha_muerte date,
    causa_muerte character varying(100),
    toxicidad_grado_max integer,
    toxicidad_descripcion text,
    cambio_dosis boolean DEFAULT false,
    suspension_tratamiento boolean DEFAULT false,
    costo_acumulado_tratamiento numeric(15,2) DEFAULT 0,
    costo_periodo numeric(15,2) DEFAULT 0,
    estado_vital character varying(20) DEFAULT 'vivo'::character varying,
    fecha_ultimo_contacto date,
    observaciones text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT seguimientos_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'realizado'::character varying, 'vencido'::character varying, 'no_aplica'::character varying])::text[]))),
    CONSTRAINT seguimientos_estado_clinico_check CHECK (((estado_clinico)::text = ANY ((ARRAY['sin_iniciar'::character varying, 'en_tratamiento'::character varying, 'respuesta_parcial'::character varying, 'respuesta_completa'::character varying, 'enfermedad_estable'::character varying, 'progresion'::character varying, 'fin_tratamiento'::character varying, 'fallecido'::character varying, 'perdido'::character varying, NULL::character varying])::text[]))),
    CONSTRAINT seguimientos_estado_vital_check CHECK (((estado_vital)::text = ANY ((ARRAY['vivo'::character varying, 'fallecido'::character varying, 'perdido'::character varying])::text[]))),
    CONSTRAINT seguimientos_respuesta_recist_check CHECK (((respuesta_recist)::text = ANY ((ARRAY['RC'::character varying, 'RP'::character varying, 'EE'::character varying, 'PE'::character varying, 'NE'::character varying, NULL::character varying])::text[]))),
    CONSTRAINT seguimientos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['post_comite'::character varying, 'trimestral_1'::character varying, 'trimestral_2'::character varying, 'trimestral_3'::character varying, 'trimestral_4'::character varying, 'semestral'::character varying, 'anual'::character varying, 'ad_hoc'::character varying])::text[]))),
    CONSTRAINT seguimientos_toxicidad_grado_max_check CHECK (((toxicidad_grado_max >= 0) AND (toxicidad_grado_max <= 5)))
);

--
-- Name: seguimientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seguimientos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: seguimientos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seguimientos_id_seq OWNED BY public.seguimientos.id;

--
-- Name: vw_dashboard_general; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_dashboard_general AS
 SELECT count(*) AS total_casos,
    count(*) FILTER (WHERE ((estado)::text = 'activo'::text)) AS activos,
    count(*) FILTER (WHERE ((estado)::text = 'en_tratamiento'::text)) AS en_tratamiento,
    count(*) FILTER (WHERE ((estado)::text = 'fallecido'::text)) AS fallecidos,
    count(*) FILTER (WHERE ((estado)::text = 'progresion'::text)) AS en_progresion,
    count(*) FILTER (WHERE ((estado)::text = 'perdido'::text)) AS perdidos,
    count(*) FILTER (WHERE ((estado)::text = 'cancelado'::text)) AS cancelados,
    avg(oportunidad_dias) FILTER (WHERE (oportunidad_dias IS NOT NULL)) AS oportunidad_promedio,
    (((count(*) FILTER (WHERE (adherente_protocolo = true)))::numeric * 100.0) / (NULLIF(count(*) FILTER (WHERE (adherente_protocolo IS NOT NULL)), 0))::numeric) AS pct_adherencia,
    sum(costo_previo) AS costo_total_antes,
    sum(costo_post) AS costo_total_despues,
    sum(diferencia_costo) AS diferencia_total
   FROM public.casos_comite;

--
-- Name: vw_kpi_mensual; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_kpi_mensual AS
 SELECT (date_trunc('month'::text, (fecha_presentacion)::timestamp with time zone))::date AS mes,
    count(*) AS casos,
    count(*) FILTER (WHERE ((decision)::text = 'aprobado'::text)) AS aprobados,
    count(*) FILTER (WHERE ((decision)::text = 'rechazado'::text)) AS rechazados,
    count(*) FILTER (WHERE ((decision)::text = 'modificado'::text)) AS modificados,
    avg(oportunidad_dias) AS oportunidad_prom,
    (((count(*) FILTER (WHERE (adherente_protocolo = true)))::numeric * 100.0) / (NULLIF(count(*) FILTER (WHERE (adherente_protocolo IS NOT NULL)), 0))::numeric) AS pct_adherencia,
    sum(diferencia_costo) AS ahorro_mes
   FROM public.casos_comite
  WHERE (fecha_presentacion IS NOT NULL)
  GROUP BY (date_trunc('month'::text, (fecha_presentacion)::timestamp with time zone))
  ORDER BY ((date_trunc('month'::text, (fecha_presentacion)::timestamp with time zone))::date) DESC;

--
-- Name: vw_outcomes_vs_evidencia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_outcomes_vs_evidencia AS
 SELECT pr.nombre AS protocolo,
    pr.estudio_pivotal,
    pr.diagnostico,
    count(*) AS n_pacientes,
    round(avg(d.pfs_meses), 1) AS pfs_real,
    pr.pfs_esperado_meses AS pfs_estudio,
    round((avg(d.pfs_meses) - pr.pfs_esperado_meses), 1) AS delta_pfs,
    round(avg(d.os_meses), 1) AS os_real,
    pr.os_esperado_meses AS os_estudio,
    round((avg(d.os_meses) - pr.os_esperado_meses), 1) AS delta_os,
    round(avg(d.costo_avac), 0) AS costo_avac_prom
   FROM (public.desenlaces d
     JOIN public.protocolos pr ON ((d.protocolo_id = pr.id)))
  WHERE ((d.pfs_meses IS NOT NULL) OR (d.os_meses IS NOT NULL))
  GROUP BY pr.nombre, pr.estudio_pivotal, pr.diagnostico, pr.pfs_esperado_meses, pr.os_esperado_meses;

--
-- Name: vw_seguimiento_economico; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_seguimiento_economico AS
 SELECT c.id AS caso_id,
    p.nombre AS paciente,
    c.molecula_aprobada,
    pr.nombre AS protocolo,
    c.costo_previo,
    c.costo_post AS costo_aprobado,
    c.diferencia_costo AS ahorro_inicial,
    COALESCE(( SELECT sum(s.costo_periodo) AS sum
           FROM public.seguimientos s
          WHERE ((s.caso_id = c.id) AND ((s.estado)::text = 'realizado'::text))), (0)::numeric) AS costo_acumulado_real,
    COALESCE(( SELECT s.estado_clinico
           FROM public.seguimientos s
          WHERE ((s.caso_id = c.id) AND ((s.estado)::text = 'realizado'::text))
          ORDER BY s.fecha_realizada DESC
         LIMIT 1), 'sin_evaluar'::character varying) AS ultimo_estado_clinico,
    c.estado
   FROM ((public.casos_comite c
     JOIN public.pacientes p ON ((c.paciente_id = p.id)))
     LEFT JOIN public.protocolos pr ON ((c.protocolo_id = pr.id)))
  WHERE ((c.decision)::text = ANY ((ARRAY['aprobado'::character varying, 'modificado'::character varying])::text[]));

--
-- Name: vw_seguimientos_pendientes; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_seguimientos_pendientes AS
 SELECT s.id,
    s.caso_id,
    s.tipo,
    s.fecha_programada,
    s.estado,
    p.nombre AS paciente,
    p.documento,
    g.nombre AS gestor,
    c.molecula_aprobada,
    c.decision,
    c.costo_post,
    pr.nombre AS protocolo,
    pr.pfs_esperado_meses,
    pr.os_esperado_meses,
    pr.estudio_pivotal,
    (CURRENT_DATE - s.fecha_programada) AS dias_vencido,
    round((((CURRENT_DATE - COALESCE(c.fecha_presentacion, c.fecha_solicitud)))::numeric / 30.0), 1) AS meses_en_tratamiento
   FROM ((((public.seguimientos s
     JOIN public.casos_comite c ON ((s.caso_id = c.id)))
     JOIN public.pacientes p ON ((c.paciente_id = p.id)))
     LEFT JOIN public.gestores g ON ((s.gestor_id = g.id)))
     LEFT JOIN public.protocolos pr ON ((c.protocolo_id = pr.id)))
  WHERE ((s.estado)::text = ANY ((ARRAY['pendiente'::character varying, 'vencido'::character varying])::text[]))
  ORDER BY s.fecha_programada;

--
-- Name: alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas ALTER COLUMN id SET DEFAULT nextval('public.alertas_id_seq'::regclass);

--
-- Name: casos_comite id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite ALTER COLUMN id SET DEFAULT nextval('public.casos_comite_id_seq'::regclass);

--
-- Name: casos_historial id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_historial ALTER COLUMN id SET DEFAULT nextval('public.casos_historial_id_seq'::regclass);

--
-- Name: desenlaces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desenlaces ALTER COLUMN id SET DEFAULT nextval('public.desenlaces_id_seq'::regclass);

--
-- Name: diagnosticos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosticos ALTER COLUMN id SET DEFAULT nextval('public.diagnosticos_id_seq'::regclass);

--
-- Name: eps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eps ALTER COLUMN id SET DEFAULT nextval('public.eps_id_seq'::regclass);

--
-- Name: gestores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestores ALTER COLUMN id SET DEFAULT nextval('public.gestores_id_seq'::regclass);

--
-- Name: medicamentos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicamentos ALTER COLUMN id SET DEFAULT nextval('public.medicamentos_id_seq'::regclass);

--
-- Name: medicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicos ALTER COLUMN id SET DEFAULT nextval('public.medicos_id_seq'::regclass);

--
-- Name: pacientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes ALTER COLUMN id SET DEFAULT nextval('public.pacientes_id_seq'::regclass);

--
-- Name: protocolos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos ALTER COLUMN id SET DEFAULT nextval('public.protocolos_id_seq'::regclass);

--
-- Name: sedes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sedes ALTER COLUMN id SET DEFAULT nextval('public.sedes_id_seq'::regclass);

--
-- Name: seguimientos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos ALTER COLUMN id SET DEFAULT nextval('public.seguimientos_id_seq'::regclass);

--
-- Name: alertas alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_pkey PRIMARY KEY (id);

--
-- Name: casos_comite casos_comite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_pkey PRIMARY KEY (id);

--
-- Name: casos_historial casos_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_historial
    ADD CONSTRAINT casos_historial_pkey PRIMARY KEY (id);

--
-- Name: desenlaces desenlaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desenlaces
    ADD CONSTRAINT desenlaces_pkey PRIMARY KEY (id);

--
-- Name: diagnosticos diagnosticos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosticos
    ADD CONSTRAINT diagnosticos_pkey PRIMARY KEY (id);

--
-- Name: eps eps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eps
    ADD CONSTRAINT eps_pkey PRIMARY KEY (id);

--
-- Name: gestores gestores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gestores
    ADD CONSTRAINT gestores_pkey PRIMARY KEY (id);

--
-- Name: medicamentos medicamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicamentos
    ADD CONSTRAINT medicamentos_pkey PRIMARY KEY (id);

--
-- Name: medicos medicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicos
    ADD CONSTRAINT medicos_pkey PRIMARY KEY (id);

--
-- Name: pacientes pacientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);

--
-- Name: pacientes pacientes_tipo_documento_documento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_tipo_documento_documento_key UNIQUE (tipo_documento, documento);

--
-- Name: protocolos protocolos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_pkey PRIMARY KEY (id);

--
-- Name: sedes sedes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sedes
    ADD CONSTRAINT sedes_pkey PRIMARY KEY (id);

--
-- Name: seguimientos seguimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos
    ADD CONSTRAINT seguimientos_pkey PRIMARY KEY (id);

--
-- Name: idx_alertas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_estado ON public.alertas USING btree (estado);

--
-- Name: idx_casos_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_decision ON public.casos_comite USING btree (decision);

--
-- Name: idx_casos_diagnostico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_diagnostico ON public.casos_comite USING btree (diagnostico_id);

--
-- Name: idx_casos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_estado ON public.casos_comite USING btree (estado);

--
-- Name: idx_casos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_fecha ON public.casos_comite USING btree (fecha_presentacion);

--
-- Name: idx_casos_gestor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_gestor ON public.casos_comite USING btree (gestor_id);

--
-- Name: idx_casos_medico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_medico ON public.casos_comite USING btree (medico_id);

--
-- Name: idx_casos_paciente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_paciente ON public.casos_comite USING btree (paciente_id);

--
-- Name: idx_casos_prioridad; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_prioridad ON public.casos_comite USING btree (prioridad);

--
-- Name: idx_casos_protocolo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_protocolo ON public.casos_comite USING btree (protocolo_id);

--
-- Name: idx_casos_sede; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_sede ON public.casos_comite USING btree (sede_id);

--
-- Name: idx_casos_solicitud; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_casos_solicitud ON public.casos_comite USING btree (fecha_solicitud);

--
-- Name: idx_historial_caso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_caso ON public.casos_historial USING btree (caso_id, created_at DESC);

--
-- Name: idx_historial_caso_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_caso_fecha ON public.casos_historial USING btree (caso_id, created_at DESC);

--
-- Name: idx_historial_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historial_usuario ON public.casos_historial USING btree (usuario_id);

--
-- Name: idx_pacientes_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pacientes_doc ON public.pacientes USING btree (tipo_documento, documento);

--
-- Name: idx_seg_caso; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seg_caso ON public.seguimientos USING btree (caso_id);

--
-- Name: idx_seg_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seg_estado ON public.seguimientos USING btree (estado);

--
-- Name: idx_seg_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seg_fecha ON public.seguimientos USING btree (fecha_programada);

--
-- Name: casos_comite tr_auto_seguimientos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_auto_seguimientos AFTER INSERT OR UPDATE ON public.casos_comite FOR EACH ROW EXECUTE FUNCTION public.crear_seguimientos_auto();

--
-- Name: casos_comite tr_casos_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_casos_updated BEFORE UPDATE ON public.casos_comite FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

--
-- Name: pacientes tr_pacientes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_pacientes_updated BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

--
-- Name: seguimientos tr_siguiente_evaluacion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_siguiente_evaluacion AFTER UPDATE ON public.seguimientos FOR EACH ROW EXECUTE FUNCTION public.programar_siguiente_evaluacion();

--
-- Name: casos_comite trg_caso_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_caso_historial AFTER INSERT OR DELETE OR UPDATE ON public.casos_comite FOR EACH ROW EXECUTE FUNCTION public.fn_log_caso_cambio();

--
-- Name: alertas alertas_caso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES public.casos_comite(id) ON DELETE CASCADE;

--
-- Name: alertas alertas_resuelta_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_resuelta_por_fkey FOREIGN KEY (resuelta_por) REFERENCES public.gestores(id);

--
-- Name: casos_comite casos_comite_diagnostico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_diagnostico_id_fkey FOREIGN KEY (diagnostico_id) REFERENCES public.diagnosticos(id);

--
-- Name: casos_comite casos_comite_gestor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.gestores(id);

--
-- Name: casos_comite casos_comite_medico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_medico_id_fkey FOREIGN KEY (medico_id) REFERENCES public.medicos(id);

--
-- Name: casos_comite casos_comite_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;

--
-- Name: casos_comite casos_comite_protocolo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id);

--
-- Name: casos_comite casos_comite_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_comite
    ADD CONSTRAINT casos_comite_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);

--
-- Name: casos_historial casos_historial_caso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_historial
    ADD CONSTRAINT casos_historial_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES public.casos_comite(id) ON DELETE CASCADE;

--
-- Name: casos_historial casos_historial_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casos_historial
    ADD CONSTRAINT casos_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

--
-- Name: desenlaces desenlaces_caso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desenlaces
    ADD CONSTRAINT desenlaces_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES public.casos_comite(id);

--
-- Name: desenlaces desenlaces_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desenlaces
    ADD CONSTRAINT desenlaces_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;

--
-- Name: desenlaces desenlaces_protocolo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desenlaces
    ADD CONSTRAINT desenlaces_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id);

--
-- Name: diagnosticos diagnosticos_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosticos
    ADD CONSTRAINT diagnosticos_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;

--
-- Name: medicamentos medicamentos_caso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicamentos
    ADD CONSTRAINT medicamentos_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES public.casos_comite(id) ON DELETE CASCADE;

--
-- Name: medicos medicos_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicos
    ADD CONSTRAINT medicos_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);

--
-- Name: pacientes pacientes_eps_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_eps_id_fkey FOREIGN KEY (eps_id) REFERENCES public.eps(id);

--
-- Name: pacientes pacientes_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);

--
-- Name: seguimientos seguimientos_caso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos
    ADD CONSTRAINT seguimientos_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES public.casos_comite(id) ON DELETE CASCADE;

--
-- Name: seguimientos seguimientos_gestor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguimientos
    ADD CONSTRAINT seguimientos_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.gestores(id);

--
-- Name: casos_historial Historial: nadie elimina directo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Historial: nadie elimina directo" ON public.casos_historial FOR DELETE TO authenticated USING (false);

--
-- Name: casos_historial Historial: nadie inserta directo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Historial: nadie inserta directo" ON public.casos_historial FOR INSERT TO authenticated WITH CHECK (false);

--
-- Name: casos_historial Historial: nadie modifica directo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Historial: nadie modifica directo" ON public.casos_historial FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

--
-- Name: casos_historial Historial: usuarios autenticados leen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Historial: usuarios autenticados leen" ON public.casos_historial FOR SELECT USING ((auth.role() = 'authenticated'::text));

--
-- Name: alertas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

--
-- Name: alertas auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.alertas TO authenticated USING (true) WITH CHECK (true);

--
-- Name: casos_comite auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.casos_comite TO authenticated USING (true) WITH CHECK (true);

--
-- Name: desenlaces auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.desenlaces TO authenticated USING (true) WITH CHECK (true);

--
-- Name: diagnosticos auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.diagnosticos TO authenticated USING (true) WITH CHECK (true);

--
-- Name: eps auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.eps TO authenticated USING (true) WITH CHECK (true);

--
-- Name: gestores auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.gestores TO authenticated USING (true) WITH CHECK (true);

--
-- Name: medicamentos auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.medicamentos TO authenticated USING (true) WITH CHECK (true);

--
-- Name: medicos auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.medicos TO authenticated USING (true) WITH CHECK (true);

--
-- Name: pacientes auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.pacientes TO authenticated USING (true) WITH CHECK (true);

--
-- Name: protocolos auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.protocolos TO authenticated USING (true) WITH CHECK (true);

--
-- Name: sedes auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.sedes TO authenticated USING (true) WITH CHECK (true);

--
-- Name: seguimientos auth_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_all ON public.seguimientos TO authenticated USING (true) WITH CHECK (true);

--
-- Name: casos_comite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.casos_comite ENABLE ROW LEVEL SECURITY;

--
-- Name: casos_historial; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.casos_historial ENABLE ROW LEVEL SECURITY;

--
-- Name: desenlaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desenlaces ENABLE ROW LEVEL SECURITY;

--
-- Name: medicamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medicamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: pacientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

--
-- Name: seguimientos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Fin de la baseline
-- ============================================================
