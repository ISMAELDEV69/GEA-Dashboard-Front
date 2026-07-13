BEGIN;

-- 1. Add ID to grupos_capacitacion
ALTER TABLE grupos_capacitacion ADD COLUMN id UUID DEFAULT gen_random_uuid() UNIQUE;

-- 2. Add grupo_id to dependent tables
ALTER TABLE nominas ADD COLUMN grupo_id UUID;
ALTER TABLE grupo_reclutadores ADD COLUMN grupo_id UUID;
ALTER TABLE grupos_dia1 ADD COLUMN grupo_id UUID;
ALTER TABLE asistencias_dia1_reclutador ADD COLUMN grupo_id UUID;

-- 3. Populate new columns
UPDATE nominas n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE grupo_reclutadores n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE grupos_dia1 n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;
UPDATE asistencias_dia1_reclutador n SET grupo_id = g.id FROM grupos_capacitacion g WHERE n.grupo_codigo = g.codigo;

-- 4. Drop old FKs
ALTER TABLE nominas DROP CONSTRAINT nominas_grupo_codigo_fkey;
ALTER TABLE grupo_reclutadores DROP CONSTRAINT grupo_reclutadores_grupo_codigo_fkey;
ALTER TABLE grupos_dia1 DROP CONSTRAINT grupos_dia1_grupo_codigo_fkey;
ALTER TABLE asistencias_dia1_reclutador DROP CONSTRAINT asistencias_dia1_reclutador_grupo_codigo_fkey;

-- 5. Drop old PK
ALTER TABLE grupos_capacitacion DROP CONSTRAINT grupos_capacitacion_pkey CASCADE;

-- 6. Set new PK
ALTER TABLE grupos_capacitacion ADD PRIMARY KEY (id);

-- 7. Add new FKs
ALTER TABLE nominas ADD CONSTRAINT nominas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE grupo_reclutadores ADD CONSTRAINT grupo_reclutadores_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE grupos_dia1 ADD CONSTRAINT grupos_dia1_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;
ALTER TABLE asistencias_dia1_reclutador ADD CONSTRAINT asistencias_dia1_reclutador_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_capacitacion(id) ON DELETE CASCADE;

-- 8. Drop old columns
-- WAIT! Some views might depend on `grupo_codigo` in `nominas`! Let's check view dependencies before dropping!
-- Let's NOT drop them yet, just rename them.
-- Actually, we MUST drop them if we want to insert duplicate `codigo` in `grupos_capacitacion` without issues?
-- We can leave `codigo` in `grupos_capacitacion`, just not as PK!

COMMIT;
