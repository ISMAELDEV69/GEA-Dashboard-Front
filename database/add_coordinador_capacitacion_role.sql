-- ============================================================
-- Migración: Crear nuevo rol 'coordinador_capacitacion'
-- Fecha: 2026-10-14
-- ============================================================

-- 1. Agregar el valor al enum app_role (si existe el tipo enum en PostgreSQL)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    BEGIN
      ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'coordinador_capacitacion';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 2. Si la columna rol en perfiles tiene un CHECK constraint, actualizarlo si aplica
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%rol%'
  ) THEN
    -- En caso de tener check constraint basado en texto
    NULL;
  END IF;
END $$;

-- 3. Registrar el rol en la tabla config_roles (Gestión dinámica de roles y permisos)
INSERT INTO public.config_roles (id, label, short_label, description, color, dot_color, icon)
VALUES (
  'coordinador_capacitacion',
  'Coordinador Cap.',
  'CC',
  'Coordinación operativa y seguimiento de capacitación / formación.',
  'bg-amber-600/10 text-amber-500 border-amber-600/20',
  'bg-amber-600',
  'GraduationCap'
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  short_label = EXCLUDED.short_label,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  dot_color = EXCLUDED.dot_color,
  icon = EXCLUDED.icon;

-- 4. Actualizar políticas RLS de capacidad_rys
DROP POLICY IF EXISTS "supervisor_segmento_capacidad" ON capacidad_rys;
CREATE POLICY "supervisor_segmento_capacidad" ON capacidad_rys
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles 
      WHERE id = auth.uid() 
        AND rol IN ('admin', 'jefe_capacitacion', 'coordinador_capacitacion', 'jefe_rys', 'coordinador_rys', 'visor')
    )
    OR (
      (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'supervisor_capacitacion'
      AND (
        (SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid()) IS NULL
        OR UPPER(TRIM(COALESCE(capacidad_rys.segmento, ''))) = UPPER(TRIM((SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid())))
      )
    )
    OR EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'formador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles 
      WHERE id = auth.uid() 
        AND rol IN ('admin', 'jefe_capacitacion', 'coordinador_capacitacion', 'jefe_rys', 'coordinador_rys')
    )
    OR (
      (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'supervisor_capacitacion'
      AND (
        (SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid()) IS NULL
        OR UPPER(TRIM(COALESCE(capacidad_rys.segmento, ''))) = UPPER(TRIM((SELECT p.segmento FROM perfiles p WHERE p.id = auth.uid())))
      )
    )
    OR EXISTS (
      SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'formador'
    )
  );

-- 5. Actualizar políticas RLS de nominas
DROP POLICY IF EXISTS "Lectura nominas por roles autorizados" ON public.nominas;
CREATE POLICY "Lectura nominas por roles autorizados" 
ON public.nominas FOR SELECT 
TO authenticated 
USING (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'supervisor_capacitacion', 
    'coordinador_capacitacion',
    'jefe_capacitacion', 
    'formador', 
    'reclutador', 
    'visor'
  )
);

DROP POLICY IF EXISTS "Escritura nominas por roles de gestion" ON public.nominas;
CREATE POLICY "Escritura nominas por roles de gestion" 
ON public.nominas FOR ALL 
TO authenticated 
USING (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'reclutador', 
    'supervisor_capacitacion', 
    'coordinador_capacitacion',
    'jefe_capacitacion'
  )
) 
WITH CHECK (
  public.is_admin() OR 
  public.get_user_role() IN (
    'jefe_rys', 
    'coordinador_rys', 
    'reclutador', 
    'supervisor_capacitacion', 
    'coordinador_capacitacion',
    'jefe_capacitacion'
  )
);

-- 6. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload schema';
