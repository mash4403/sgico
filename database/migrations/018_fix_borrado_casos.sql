-- ============================================================
-- SGICO: Migración 018 — Borrado de casos con auditoría
-- ============================================================
--
-- PROBLEMA: borrar un caso de casos_comite no surtía efecto.
--   El trigger trg_caso_historial (AFTER DELETE) inserta en
--   casos_historial un registro 'eliminar' con caso_id = OLD.id, pero
--   la FK casos_historial_caso_id_fkey exige que el caso exista: el
--   INSERT falla y Postgres revierte todo el DELETE.
--   Además desenlaces_caso_id_fkey no tenía ON DELETE, así que un caso
--   con desenlaces tampoco se podía borrar.
--
-- SOLUCIÓN:
--   1. casos_historial deja de tener FK hacia casos_comite. Es un log de
--      auditoría inmutable: debe sobrevivir al caso, incluido el registro
--      de quién lo eliminó y cuándo. (Antes, el borrado en cascada se
--      llevaba también el historial.)
--   2. desenlaces se borra en cascada con su caso, igual que seguimientos,
--      alertas, medicamentos y actas.
--
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

BEGIN;

ALTER TABLE casos_historial
  DROP CONSTRAINT IF EXISTS casos_historial_caso_id_fkey;

ALTER TABLE desenlaces
  DROP CONSTRAINT IF EXISTS desenlaces_caso_id_fkey;
ALTER TABLE desenlaces
  ADD CONSTRAINT desenlaces_caso_id_fkey
  FOREIGN KEY (caso_id) REFERENCES casos_comite(id) ON DELETE CASCADE;

COMMENT ON COLUMN casos_historial.caso_id IS
  'Id del caso auditado. Sin FK a propósito: el historial sobrevive al borrado del caso.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casos_historial_caso_id_fkey') THEN
    RAISE EXCEPTION 'ABORT: casos_historial todavía tiene FK hacia casos_comite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'desenlaces_caso_id_fkey' AND confdeltype = 'c') THEN
    RAISE EXCEPTION 'ABORT: desenlaces_caso_id_fkey no quedó con ON DELETE CASCADE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_caso_historial' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'ABORT: trg_caso_historial no está activo';
  END IF;
  RAISE NOTICE 'OK: los casos ya se pueden borrar y el borrado queda auditado';
END $$;

COMMIT;
