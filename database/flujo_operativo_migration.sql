-- Flujo reclutamiento → capacitación: vínculos de perfil y atribución de bajas
ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS reclutador_id BIGINT REFERENCES reclutadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS formador_documento VARCHAR(20) REFERENCES formadores(documento) ON DELETE SET NULL;

ALTER TABLE asistencias_capacitacion
  ADD COLUMN IF NOT EXISTS atribucion_baja VARCHAR(20)
    CHECK (atribucion_baja IS NULL OR atribucion_baja IN ('RECLUTADOR', 'CAPACITADOR', 'NEUTRO'));

CREATE INDEX IF NOT EXISTS idx_asistencias_atribucion ON asistencias_capacitacion(atribucion_baja)
  WHERE sigla_asistencia = 'B';

INSERT INTO motivos_baja (motivo, siglas, descripcion) VALUES
  ('MANEJO DE PC', 'MPC', 'Sin dominio de PC — imputable a reclutamiento'),
  ('FACILIDADES TÉCNICAS', 'FTE', 'Sin PC/audífonos — imputable a reclutamiento'),
  ('FALTA DOCUMENTACION', 'FDOC', 'Documentación incompleta'),
  ('BLACK LIST CLIENTE', 'BLC', 'Restricción cliente'),
  ('BLACK LIST GEA', 'BLG', 'Restricción GEA'),
  ('FRAUDE', 'FRD', 'Fraude detectado'),
  ('ACTITUD', 'ACT', 'Actitud incompatible'),
  ('HABILIDAD COMERCIAL', 'HCOM', 'Habilidad comercial insuficiente'),
  ('HABILIDAD ATC', 'HATC', 'Habilidad ATC insuficiente'),
  ('DESAPROBADO EN OJT', 'DOJT', 'No aprobó OJT — capacitación'),
  ('REINGRESO NO APTO', 'RNA', 'Reingreso no califica')
ON CONFLICT (motivo) DO NOTHING;
