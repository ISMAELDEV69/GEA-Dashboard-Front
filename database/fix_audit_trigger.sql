-- Fix: record "new" has no field "id" en postulantes (PK = documento)
CREATE OR REPLACE FUNCTION procesar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_old JSONB; v_new JSONB; v_id VARCHAR(100); v_email VARCHAR(255);
  v_row JSONB;
BEGIN
  BEGIN
    v_email := COALESCE(current_setting('request.jwt.claim.email', true), 'system');
  EXCEPTION WHEN OTHERS THEN v_email := 'system'; END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_row := v_old;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;
  ELSE
    v_new := to_jsonb(NEW);
    v_row := v_new;
  END IF;

  v_id := COALESCE(
    v_row->>'documento',
    v_row->>'id',
    v_row->>'postulante_documento',
    v_row->>'nomina_id',
    'unknown'
  );

  INSERT INTO audit_logs(tabla_afectada, operacion, id_registro, valores_anteriores, valores_nuevos, usuario_email)
  VALUES (TG_TABLE_NAME, TG_OP, v_id, v_old, v_new, v_email);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
