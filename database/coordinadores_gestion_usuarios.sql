-- ==============================================================================
-- MIGRACIÓN: Permitir a Coordinadores y Jefes gestionar usuarios de su área
-- Funciones actualizadas: admin_create_user, admin_reset_user_password, RLS perfiles
-- ==============================================================================

-- 1. Actualizar admin_create_user para permitir coordinadores y jefes
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email    TEXT,
  p_password TEXT,
  p_nombre   TEXT DEFAULT NULL,
  p_rol      TEXT DEFAULT 'visor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid          UUID;
  v_safe_rol     TEXT;
  v_clean_email  TEXT;
  v_display_name TEXT;
  v_caller_role  TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar esta acción';
  END IF;

  -- Obtener rol del usuario que ejecuta la acción
  SELECT rol INTO v_caller_role FROM public.perfiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'coordinador_rys', 'jefe_rys', 'coordinador_capacitacion', 'jefe_capacitacion') THEN
    RAISE EXCEPTION 'No tienes permisos para crear o gestionar usuarios';
  END IF;

  -- Regla de Seguridad: Solo admin puede crear otros admins
  IF v_caller_role != 'admin' AND p_rol = 'admin' THEN
    RAISE EXCEPTION 'Solo un Administrador puede crear usuarios con rol admin';
  END IF;

  -- Regla de Seguridad para Reclutamiento: no puede crear roles ajenos
  IF v_caller_role IN ('coordinador_rys', 'jefe_rys') AND p_rol NOT IN ('reclutador', 'coordinador_rys', 'visor') THEN
    RAISE EXCEPTION 'Coordinadores de RyS solo pueden crear usuarios con rol reclutador o visor';
  END IF;

  -- Regla de Seguridad para Capacitación: no puede crear roles ajenos
  IF v_caller_role IN ('coordinador_capacitacion', 'jefe_capacitacion') AND p_rol NOT IN ('formador', 'supervisor_capacitacion', 'coordinador_capacitacion', 'visor') THEN
    RAISE EXCEPTION 'Coordinadores de Capacitación solo pueden crear roles de su área';
  END IF;

  v_clean_email := lower(trim(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'El correo es obligatorio';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  v_safe_rol := coalesce(nullif(trim(p_rol), ''), 'visor');
  v_display_name := coalesce(nullif(trim(p_nombre), ''), split_part(v_clean_email, '@', 1));

  -- Si el usuario ya existe en auth.users, actualizar contraseña y metadata
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;
    
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = NOW(),
        raw_user_meta_data = jsonb_build_object('nombre', v_display_name, 'rol', v_safe_rol)
    WHERE id = v_uid;

    INSERT INTO public.perfiles (id, nombre, rol, must_change_password)
    VALUES (v_uid, v_display_name, v_safe_rol, false)
    ON CONFLICT (id) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        rol = EXCLUDED.rol,
        must_change_password = false;

    RETURN jsonb_build_object(
      'id', v_uid,
      'email', v_clean_email,
      'nombre', v_display_name,
      'rol', v_safe_rol,
      'reassigned', true
    );
  END IF;

  -- Crear nuevo usuario en auth.users
  v_uid := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_uid,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', v_safe_rol),
    jsonb_build_object('nombre', v_display_name, 'rol', v_safe_rol),
    NOW(),
    NOW(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_clean_email),
    'email',
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO public.perfiles (id, nombre, rol, must_change_password)
  VALUES (v_uid, v_display_name, v_safe_rol, false)
  ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      rol = EXCLUDED.rol;

  RETURN jsonb_build_object(
    'id', v_uid,
    'email', v_clean_email,
    'nombre', v_display_name,
    'rol', v_safe_rol,
    'created', true
  );
END;
$$;

-- 2. Actualizar admin_reset_user_password para permitir a coordinadores de su área
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_user_id  UUID,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar esta acción';
  END IF;

  SELECT rol INTO v_caller_role FROM public.perfiles WHERE id = auth.uid();
  SELECT rol INTO v_target_role FROM public.perfiles WHERE id = p_user_id;

  IF v_caller_role NOT IN ('admin', 'coordinador_rys', 'jefe_rys', 'coordinador_capacitacion', 'jefe_capacitacion') THEN
    RAISE EXCEPTION 'No tienes permisos para restablecer contraseñas';
  END IF;

  -- Seguridad: Un no-admin NUNCA puede restablecer la contraseña de un Administrador
  IF v_target_role = 'admin' AND v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'No tienes permisos para modificar la contraseña de un Administrador';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado en el sistema';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Contraseña actualizada correctamente'
  );
END;
$$;

-- 3. Actualizar política RLS para permitir a coordinadores actualizar perfiles de su personal
DROP POLICY IF EXISTS "update_perfiles" ON public.perfiles;
CREATE POLICY "update_perfiles" ON public.perfiles 
  FOR UPDATE TO authenticated 
  USING (
    id = auth.uid() 
    OR auth.jwt() ->> 'role' = 'service_role'
    OR (auth.jwt() -> 'user_metadata' ->> 'rol') IN ('admin', 'coordinador_rys', 'jefe_rys', 'coordinador_capacitacion', 'jefe_capacitacion')
    OR EXISTS (
      SELECT 1 FROM public.perfiles p 
      WHERE p.id = auth.uid() 
      AND p.rol IN ('admin', 'coordinador_rys', 'jefe_rys', 'coordinador_capacitacion', 'jefe_capacitacion')
    )
  );

GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
