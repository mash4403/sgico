-- ============================================================
-- SGICO: Migración 020 — Tipo de estudio y enlace en el catálogo de protocolos
-- ============================================================
--
-- OBJETIVO: que al escoger un protocolo en el formulario de presentación se
-- autocompleten el tipo de estudio (fase III, fase II, mundo real, ...) y el
-- enlace a la publicación, igual que hoy el estudio pivotal, PFS y OS.
--
--   - protocolos.tipo_evidencia : mismos valores que casos_comite.evidencia_tipo
--   - protocolos.evidencia_link : DOI / PubMed del estudio
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE protocolos
  ADD COLUMN IF NOT EXISTS tipo_evidencia varchar(30),
  ADD COLUMN IF NOT EXISTS evidencia_link text;

ALTER TABLE protocolos DROP CONSTRAINT IF EXISTS protocolos_tipo_evidencia_check;
ALTER TABLE protocolos ADD CONSTRAINT protocolos_tipo_evidencia_check CHECK (
  tipo_evidencia IS NULL OR tipo_evidencia IN (
    'fase_3', 'fase_2', 'fase_1', 'metanalisis', 'revision_sistematica',
    'guia', 'consenso', 'real_world', 'reporte_caso', 'otro'
  )
);

COMMENT ON COLUMN protocolos.tipo_evidencia IS 'Tipo del estudio que soporta el protocolo (fase_3, fase_2, real_world, ...). Se copia a casos_comite.evidencia_tipo al escoger el protocolo.';
COMMENT ON COLUMN protocolos.evidencia_link IS 'Enlace (DOI / PubMed) del estudio que soporta el protocolo.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='protocolos' AND column_name='tipo_evidencia') THEN
    RAISE EXCEPTION 'Migración 020: falta protocolos.tipo_evidencia';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='protocolos' AND column_name='evidencia_link') THEN
    RAISE EXCEPTION 'Migración 020: falta protocolos.evidencia_link';
  END IF;
  RAISE NOTICE 'Migración 020 OK';
END $$;

COMMIT;
