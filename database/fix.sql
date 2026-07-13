CREATE OR REPLACE FUNCTION sync_nominas_desde_grupo()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nominas n SET
    campana_id       = NEW.campana_id,
    semana_trabajo   = NEW.semana_trabajo,
    modalidad        = COALESCE(NEW.modalidad::modalidad_tipo, n.modalidad),
    condicion        = COALESCE(NEW.condicion, n.condicion),
    horario_gestion  = COALESCE(NEW.rango_horario, n.horario_gestion),
    updated_at       = NOW()
  WHERE n.grupo_codigo = NEW.codigo AND n.activo = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
