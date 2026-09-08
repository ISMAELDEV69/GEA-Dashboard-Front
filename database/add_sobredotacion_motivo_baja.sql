-- Migración para registrar el motivo de baja "SOBREDOTACIÓN" en el catálogo de Supabase
INSERT INTO motivos_baja (motivo, siglas, descripcion)
VALUES ('SOBREDOTACIÓN', 'SOB', 'Baja por sobrecupo o sobredotación del grupo')
ON CONFLICT (motivo) DO NOTHING;
