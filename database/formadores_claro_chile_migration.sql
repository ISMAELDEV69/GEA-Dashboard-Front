-- ============================================================
-- Migración: Carga y Sincronización de Equipo de Capacitación
-- Segmento: CLARO CHILE
-- Fecha: 2026-08-26
-- ============================================================

INSERT INTO public.formadores (
  documento,
  nombre_completo,
  sede,
  segmento,
  subcampana,
  cargo_contractual,
  cargo_funcional,
  estado,
  fecha_inicio,
  fecha_cese
) VALUES
  ('45322369', 'CINTHYA KATHERINE ARAUCO CHAVEZ', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2023-05-06', NULL),
  ('76518936', 'MICHAEL BRYEN ELESCANO ANCHIRAICO', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2025-01-01', NULL),
  ('46592535', 'PEDRO BRYAN FLORES LAZO', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'SUPERVISOR DE CAPACITACION', 'SUPERVISOR', 'Activo', '2025-07-02', NULL),
  ('3982473',  'JOHANA DESIREE LUGO CALDERÓN', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2025-09-01', NULL),
  ('4281528',  'CARLOS ALBERTO RUIZ CASTAÑEDA', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2025-09-01', NULL),
  ('75668861', 'JHON MILLER CARBAJAL VARGAS', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2025-09-01', NULL),
  ('73077184', 'FERNANDO NOE OYARCE RAMIREZ', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2026-02-02', NULL),
  ('77046338', 'CHRISTIAN ANTONIO YGNACIO CARBAJAL', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2026-04-06', NULL),
  ('47539064', 'JEFFERSON EDUARDO PEVES ROJAS', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2026-06-02', NULL),
  ('74321134', 'CARLOS JOAQUÍN PINCHI MONTECILLO', 'ATE', 'CLARO CHILE', 'POSTPAGO', 'FORMADOR', 'FORMADOR', 'Activo', '2026-08-01', NULL)
ON CONFLICT (documento) DO UPDATE SET
  nombre_completo   = EXCLUDED.nombre_completo,
  sede              = EXCLUDED.sede,
  segmento          = EXCLUDED.segmento,
  subcampana        = EXCLUDED.subcampana,
  cargo_contractual = EXCLUDED.cargo_contractual,
  cargo_funcional   = EXCLUDED.cargo_funcional,
  estado            = EXCLUDED.estado,
  fecha_inicio      = EXCLUDED.fecha_inicio;

-- Actualización opcional de gobernanza: si ya existe el perfil del supervisor en perfiles, asignar su segmento
UPDATE public.perfiles
SET segmento = 'CLARO CHILE'
WHERE nombre ILIKE '%PEDRO BRYAN FLORES LAZO%' 
   OR nombre ILIKE '%FLORES LAZO PEDRO BRYAN%';
