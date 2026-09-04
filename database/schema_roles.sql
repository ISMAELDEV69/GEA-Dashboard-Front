-- Crear tabla config_roles
CREATE TABLE IF NOT EXISTS public.config_roles (
    id VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    short_label VARCHAR(10) NOT NULL,
    description TEXT,
    color VARCHAR(100) DEFAULT 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    dot_color VARCHAR(100) DEFAULT 'bg-slate-500',
    icon VARCHAR(50) DEFAULT 'User',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.config_roles ENABLE ROW LEVEL SECURITY;

-- Función de seguridad centralizada
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol = 'admin'
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Políticas Seguras para config_roles
DROP POLICY IF EXISTS "Permitir lectura a todos los usuarios autenticados" ON public.config_roles;
CREATE POLICY "Permitir lectura a todos los usuarios autenticados" 
ON public.config_roles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir insercion a administradores" ON public.config_roles;
CREATE POLICY "Permitir insercion a administradores" 
ON public.config_roles FOR INSERT TO authenticated WITH CHECK (
  public.is_admin()
);

DROP POLICY IF EXISTS "Permitir actualizacion a administradores" ON public.config_roles;
CREATE POLICY "Permitir actualizacion a administradores" 
ON public.config_roles FOR UPDATE TO authenticated USING (
  public.is_admin()
) WITH CHECK (
  public.is_admin()
);

DROP POLICY IF EXISTS "Permitir borrado a administradores" ON public.config_roles;
CREATE POLICY "Permitir borrado a administradores" 
ON public.config_roles FOR DELETE TO authenticated USING (
  public.is_admin()
);

-- Insertar roles por defecto si no existen
INSERT INTO public.config_roles (id, label, short_label, description, color, dot_color, icon)
VALUES 
    ('admin', 'Admin', 'A', 'Acceso total a todos los módulos y configuraciones.', 'bg-rose-500/10 text-rose-500 border-rose-500/20', 'bg-rose-500', 'Crown'),
    ('reclutador', 'Reclutador', 'R', 'Gestión de nóminas, ingresos y KPIs de reclutamiento.', 'bg-blue-500/10 text-blue-500 border-blue-500/20', 'bg-blue-500', 'Briefcase'),
    ('formador', 'Formador', 'F', 'Gestión de aulas, asistencias y reportes de deserción.', 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', 'bg-emerald-500', 'BookOpen'),
    ('visor', 'Directivo', 'V', 'Acceso exclusivo a dashboards y reportes gerenciales.', 'bg-purple-500/10 text-purple-500 border-purple-500/20', 'bg-purple-500', 'TrendingUp'),
    ('supervisor_capacitacion', 'Supervisor Cap.', 'SC', 'Gestión y supervisión de equipos de formación.', 'bg-orange-500/10 text-orange-500 border-orange-500/20', 'bg-orange-500', 'Users'),
    ('coordinador_rys', 'Coordinador RYS', 'CR', 'Coordinación operativa de reclutamiento y selección.', 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', 'bg-cyan-500', 'UserPlus'),
    ('jefe_rys', 'Jefe RYS', 'JR', 'Jefatura general de reclutamiento y selección.', 'bg-sky-500/10 text-sky-500 border-sky-500/20', 'bg-sky-500', 'Shield'),
    ('jefe_capacitacion', 'Jefe Cap.', 'JC', 'Jefatura general de formación y capacitación.', 'bg-amber-500/10 text-amber-500 border-amber-500/20', 'bg-amber-500', 'BookOpen'),
    ('calidad', 'Calidad', 'Q', 'Monitoreo, control de calidad y auditoría de procesos en modo visor.', 'bg-teal-500/10 text-teal-500 border-teal-500/20', 'bg-teal-500', 'CheckSquare')
ON CONFLICT (id) DO NOTHING;
