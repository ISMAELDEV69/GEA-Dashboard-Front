-- ============================================================
-- SQL DE CORRECCIÓN: TRIGGER DE CREACIÓN DE USUARIOS
-- Ejecuta este código en el SQL Editor de tu consola de Supabase
-- para solucionar el error "Database error creating new user".
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_nombre text;
  v_rol text;
  v_role_enum app_role;
BEGIN
  -- Extraer nombre y rol de forma segura
  v_nombre := COALESCE(new.raw_user_meta_data->>'nombre', 'Usuario Nuevo');
  v_rol := new.raw_user_meta_data->>'rol';

  -- Validar que el rol exista en el Enum, de lo contrario asignar 'visor'
  IF v_rol IS NOT NULL AND v_rol IN ('admin', 'reclutador', 'formador', 'visor') THEN
    v_role_enum := v_rol::app_role;
  ELSE
    v_role_enum := 'visor'::app_role;
  END IF;

  -- Insertar perfil. Si ya existía un perfil huérfano con este ID, se actualiza
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (new.id, v_nombre, v_role_enum)
  ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol;
  
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Fallback de seguridad extrema para garantizar que NUNCA falle la creación del usuario
  INSERT INTO public.perfiles (id, nombre, rol)
  VALUES (new.id, COALESCE(new.email, 'Usuario Nuevo'), 'visor'::app_role)
  ON CONFLICT (id) DO UPDATE
  SET rol = 'visor'::app_role;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
