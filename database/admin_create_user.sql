-- Crear usuarios desde la plataforma (solo admin) sin Edge Function
-- Usa auth.users + trigger handle_new_user / perfiles

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
  v_safe_rol     app_role;
  v_clean_email  TEXT;
  v_display_name TEXT;
  v_instance_id  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión como administrador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden crear usuarios';
  END IF;

  v_clean_email := lower(trim(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'El correo es obligatorio';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
  END IF;

  IF p_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN
    v_safe_rol := p_rol::app_role;
  ELSE
    v_safe_rol := 'visor'::app_role;
  END IF;

  v_display_name := coalesce(nullif(trim(p_nombre), ''), split_part(v_clean_email, '@', 1));

  -- Si el usuario ya existe en auth.users, actualizar su contraseña, metadata y perfil (re-asignación)
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_clean_email LIMIT 1;
    
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        updated_at = NOW(),
        raw_user_meta_data = jsonb_build_object('nombre', v_display_name, 'rol', v_safe_rol::text)
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
      'rol', v_safe_rol::text
    );
  END IF;

  SELECT coalesce(
    (SELECT instance_id FROM auth.users LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) INTO v_instance_id;

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
    v_instance_id,
    v_uid,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', v_display_name, 'rol', v_safe_rol::text),
    NOW(),
    NOW(),
    '', '', '', ''
  );

  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (v_uid, v_display_name, v_safe_rol)
  ON CONFLICT (id) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        rol = EXCLUDED.rol;

  RETURN jsonb_build_object(
    'id', v_uid,
    'email', v_clean_email,
    'nombre', v_display_name,
    'rol', v_safe_rol::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;
