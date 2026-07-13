-- ============================================================
-- FIX COMPLETO: perfiles, roles y creación de usuarios
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── PASO 1: Políticas RLS de perfiles ───────────────────────
DROP POLICY IF EXISTS select_perfiles ON public.perfiles;
DROP POLICY IF EXISTS insert_perfiles ON public.perfiles;
DROP POLICY IF EXISTS update_perfiles ON public.perfiles;

CREATE POLICY select_perfiles ON public.perfiles
  FOR SELECT TO authenticated USING (true);

-- Permite al trigger SECURITY DEFINER insertar (auth.uid() es NULL en triggers)
CREATE POLICY insert_perfiles ON public.perfiles
  FOR INSERT TO authenticated WITH CHECK (true);

-- Usuario edita su perfil; admin edita cualquier perfil (cambiar roles)
CREATE POLICY update_perfiles ON public.perfiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  )
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin')
  );

-- ── PASO 2: Trigger al crear usuario en auth.users ──────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_nombre text;
  v_rol text;
  v_role_enum app_role;
BEGIN
  v_nombre := COALESCE(
    new.raw_user_meta_data->>'nombre',
    split_part(new.email, '@', 1),
    'Usuario Nuevo'
  );
  v_rol := new.raw_user_meta_data->>'rol';

  IF v_rol IS NOT NULL AND v_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN
    v_role_enum := v_rol::app_role;
  ELSE
    v_role_enum := 'visor'::app_role;
  END IF;

  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (new.id, v_nombre, v_role_enum)
  ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      rol = CASE
        WHEN perfiles.rol = 'visor' AND EXCLUDED.rol != 'visor' THEN EXCLUDED.rol
        ELSE perfiles.rol
      END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── PASO 3: RPC para obtener/crear perfil al iniciar sesión ─
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.perfiles AS $$
DECLARE
  result public.perfiles;
  v_meta jsonb;
  v_rol text;
BEGIN
  SELECT * INTO result FROM public.perfiles WHERE id = auth.uid();
  IF FOUND THEN RETURN result; END IF;

  v_meta := COALESCE(auth.jwt()->'user_metadata', '{}'::jsonb);
  v_rol := v_meta->>'rol';

  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (
    auth.uid(),
    COALESCE(v_meta->>'nombre', split_part(COALESCE(auth.jwt()->>'email', ''), '@', 1), 'Usuario'),
    CASE
      WHEN v_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN v_rol::app_role
      ELSE 'visor'::app_role
    END
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO result;

  IF NOT FOUND THEN
    SELECT * INTO result FROM public.perfiles WHERE id = auth.uid();
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ── PASO 4: Sincronizar perfiles faltantes desde auth.users ─
INSERT INTO public.perfiles (id, nombre, rol)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1), 'Usuario'),
  CASE
    WHEN (u.raw_user_meta_data->>'rol') IN ('admin', 'reclutador', 'formador', 'visor')
      THEN (u.raw_user_meta_data->>'rol')::app_role
    ELSE 'visor'::app_role
  END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ── PASO 5: PROMOVER TU CUENTA A ADMIN ──────────────────────
UPDATE public.perfiles
SET rol = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'clydelean@gmail.com'
  LIMIT 1
);

-- ── PASO 6: Verificar resultado ─────────────────────────────
SELECT
  u.email,
  p.nombre,
  p.rol,
  u.raw_user_meta_data->>'rol' AS rol_en_metadata
FROM auth.users u
LEFT JOIN public.perfiles p ON p.id = u.id
ORDER BY u.created_at DESC;
