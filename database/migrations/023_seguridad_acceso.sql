-- ============================================================
-- SGICO: Migración 023 — Seguridad de acceso (auditoría 2026-11-08)
-- ============================================================
--
-- Corrige los hallazgos que NO dependen de la definición de roles:
--
--   H-03  Tablas sin RLS (diagnosticos, protocolos, eps, medicos, gestores):
--         se activa RLS en TODA tabla de public. Las que no tengan ninguna
--         política reciben auth_all (solo usuarios autenticados), igual que
--         el resto, para que la aplicación siga funcionando.
--   H-02  Vistas vw_* que omitían RLS: pasan a security_invoker.
--   H-01/03  El rol anon (sin iniciar sesión) pierde todo acceso a tablas,
--         vistas, secuencias y funciones de public, también para objetos
--         que se creen en el futuro.
--   H-05  Acta firmada inmutable: un trigger rechaza UPDATE/DELETE de actas
--         firmadas, y al firmar se guarda un hash calculado en el servidor
--         (hash_servidor).
--   H-08  Bucket "adjuntos": privado, 25 MB por archivo, solo los formatos
--         que acepta la aplicación, y políticas solo para autenticados.
--
-- NO cambia lo que puede hacer un usuario autenticado (eso llega con roles).
--
-- Mantenimiento: los scripts de reinicio de datos de prueba deben ejecutar
--   SET LOCAL sgico.mantenimiento = 'si';  para poder borrar actas firmadas.
--   Esa variable solo se puede fijar desde el SQL Editor, no desde la app.
--
-- Ejecutar en: Supabase SQL Editor (una sola transacción)
-- ============================================================

BEGIN;

-- ── PASO 1 — RLS en todas las tablas de public ─────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    RAISE NOTICE 'RLS activado en %', r.tablename;
  END LOOP;

  -- Toda tabla sin políticas quedaría inaccesible: le damos la misma política
  -- que al resto (solo autenticados) para no romper la aplicación.
  FOR r IN
    SELECT t.tablename FROM pg_tables t
     WHERE t.schemaname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename)
  LOOP
    EXECUTE format('CREATE POLICY auth_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.tablename);
    RAISE NOTICE 'Política auth_all creada en % (no tenía ninguna)', r.tablename;
  END LOOP;
END $$;

-- ── PASO 2 — Vistas que respetan RLS ───────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
  END LOOP;
END $$;

-- ── PASO 3 — Sin acceso para anon (no ha iniciado sesión) ──
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Objetos que se creen en el futuro desde el SQL Editor
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- ── PASO 4 — Acta firmada inmutable + hash en el servidor ──
ALTER TABLE actas_comite ADD COLUMN IF NOT EXISTS hash_servidor text;
COMMENT ON COLUMN actas_comite.hash_servidor IS
  'SHA-256 calculado por la base al firmar, sobre todo el registro salvo hash_servidor y updated_at. Verificable con fn_hash_acta().';

CREATE OR REPLACE FUNCTION public.fn_hash_acta(a actas_comite)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to((to_jsonb(a) - 'hash_servidor' - 'updated_at')::text, 'UTF8')), 'hex')
$$;
GRANT EXECUTE ON FUNCTION public.fn_hash_acta(actas_comite) TO authenticated, service_role;

-- Hash de las actas que ya estaban firmadas (antes de activar el bloqueo)
DO $$
DECLARE v_upd boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'actas_comite'::regclass AND tgname = 'tr_actas_updated') INTO v_upd;
  IF v_upd THEN ALTER TABLE actas_comite DISABLE TRIGGER tr_actas_updated; END IF;
  UPDATE actas_comite a SET hash_servidor = public.fn_hash_acta(a) WHERE a.firmada AND a.hash_servidor IS NULL;
  IF v_upd THEN ALTER TABLE actas_comite ENABLE TRIGGER tr_actas_updated; END IF;
END $$;

-- Bloqueo: los triggers BEFORE se ejecutan en orden alfabético;
-- tr_actas_a_bloqueo va primero y tr_actas_z_hash al final.
CREATE OR REPLACE FUNCTION public.fn_bloquear_acta_firmada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.firmada IS TRUE AND current_setting('sgico.mantenimiento', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'El acta del caso % está firmada: no se puede modificar ni eliminar', OLD.caso_id
      USING HINT = 'Las correcciones se registran en un acta nueva.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_actas_a_bloqueo ON actas_comite;
CREATE TRIGGER tr_actas_a_bloqueo
  BEFORE UPDATE OR DELETE ON actas_comite
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_acta_firmada();

CREATE OR REPLACE FUNCTION public.fn_hash_acta_al_firmar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.firmada IS TRUE AND (TG_OP = 'INSERT' OR OLD.firmada IS DISTINCT FROM TRUE) THEN
    NEW.hash_servidor := public.fn_hash_acta(NEW);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_actas_z_hash ON actas_comite;
CREATE TRIGGER tr_actas_z_hash
  BEFORE INSERT OR UPDATE ON actas_comite
  FOR EACH ROW EXECUTE FUNCTION public.fn_hash_acta_al_firmar();

-- ── PASO 5 — Bucket de adjuntos (historias clínicas) ───────
INSERT INTO storage.buckets (id, name, public)
VALUES ('adjuntos', 'adjuntos', false)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 26214400,  -- 25 MB, igual que la aplicación
       allowed_mime_types = ARRAY[
         'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 WHERE id = 'adjuntos';

UPDATE storage.buckets SET public = false WHERE id = 'firmas';

DROP POLICY IF EXISTS "adjuntos auth select" ON storage.objects;
CREATE POLICY "adjuntos auth select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'adjuntos');
DROP POLICY IF EXISTS "adjuntos auth insert" ON storage.objects;
CREATE POLICY "adjuntos auth insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'adjuntos');
DROP POLICY IF EXISTS "adjuntos auth update" ON storage.objects;
CREATE POLICY "adjuntos auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'adjuntos') WITH CHECK (bucket_id = 'adjuntos');
DROP POLICY IF EXISTS "adjuntos auth delete" ON storage.objects;
CREATE POLICY "adjuntos auth delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'adjuntos');

-- ── PASO 6 — Verificación ──────────────────────────────────
DO $$
DECLARE v_txt text; v_n int;
BEGIN
  SELECT string_agg(tablename, ', ') INTO v_txt FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORT: tablas sin RLS: %', v_txt; END IF;

  SELECT string_agg(c.relname, ', ') INTO v_txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORT: vistas sin security_invoker: %', v_txt; END IF;

  SELECT string_agg(c.relname, ', ') INTO v_txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'UPDATE')
          OR has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORT: anon conserva privilegios en: %', v_txt; END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'adjuntos' AND public = false) THEN
    RAISE EXCEPTION 'ABORT: el bucket adjuntos no quedó privado';
  END IF;

  SELECT count(*) INTO v_n FROM actas_comite WHERE firmada AND hash_servidor IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'ABORT: % actas firmadas sin hash_servidor', v_n; END IF;

  RAISE NOTICE '════════ MIGRACIÓN 023 COMPLETADA ════════';
  RAISE NOTICE '  RLS en todas las tablas · vistas con security_invoker';
  RAISE NOTICE '  anon sin acceso · actas firmadas bloqueadas · bucket adjuntos privado';
END $$;

COMMIT;

-- Revisión manual: políticas de Storage que den acceso a anon o a public.
-- Debe devolver 0 filas; si aparece alguna, avísame antes de borrarla.
SELECT policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[]);
