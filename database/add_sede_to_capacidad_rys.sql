-- Agregar columna sede a capacidad_rys para permitir ingresar la Sede manualmente por grupo
ALTER TABLE capacidad_rys ADD COLUMN IF NOT EXISTS sede VARCHAR(100);
