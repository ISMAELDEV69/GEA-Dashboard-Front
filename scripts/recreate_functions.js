import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function run() {
  await client.connect()
  try {
    const sql = `
-- 1. sugerir_grupo_capacitacion
CREATE OR REPLACE FUNCTION sugerir_grupo_capacitacion(
  p_campana_id BIGINT,
  p_semana INTEGER,
  p_periodo VARCHAR,
  p_grupo_explicito VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_grupo_id UUID;
BEGIN
  IF NULLIF(TRIM(p_grupo_explicito), '') IS NOT NULL THEN
    SELECT id INTO v_grupo_id FROM grupos_capacitacion
    WHERE UPPER(codigo) = UPPER(TRIM(p_grupo_explicito))
      AND campana_id = p_campana_id
    LIMIT 1;
    IF v_grupo_id IS NOT NULL THEN RETURN v_grupo_id; END IF;
    
    -- Fallback if campana_id doesn't match perfectly
    SELECT id INTO v_grupo_id FROM grupos_capacitacion
    WHERE UPPER(codigo) = UPPER(TRIM(p_grupo_explicito))
    LIMIT 1;
    IF v_grupo_id IS NOT NULL THEN RETURN v_grupo_id; END IF;
  END IF;

  SELECT g.id INTO v_grupo_id
  FROM grupos_capacitacion g
  WHERE g.campana_id = p_campana_id
    AND g.semana_trabajo = p_semana
    AND (
      g.periodo_capacitacion = p_periodo
      OR g.periodo_capacitacion IS NULL
      OR p_periodo IS NULL
    )
  ORDER BY
    CASE WHEN g.periodo_capacitacion = p_periodo THEN 0 ELSE 1 END,
    CASE WHEN g.estado_grupo IN ('ACTIVO', 'EN_CURSO', 'PLANIFICADO') THEN 0 ELSE 1 END,
    g.created_at DESC
  LIMIT 1;

  RETURN v_grupo_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. sync_nominas_desde_grupo
CREATE OR REPLACE FUNCTION sync_nominas_desde_grupo()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE nominas n SET
    campana_id       = NEW.campana_id,
    semana_trabajo   = NEW.semana_trabajo,
    modalidad        = COALESCE(
      CASE WHEN NEW.modalidad IN ('PRESENCIAL','REMOTO','HIBRIDO') THEN NEW.modalidad::modalidad_tipo ELSE NULL END,
      n.modalidad
    ),
    condicion        = COALESCE(NEW.condicion, n.condicion),
    horario_gestion  = COALESCE(NEW.rango_horario, n.horario_gestion),
    updated_at       = NOW()
  WHERE n.grupo_id = NEW.id AND n.activo = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. registrar_nomina
CREATE OR REPLACE FUNCTION registrar_nomina(p_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_nomina_id UUID;
  v_doc VARCHAR(30);
  v_grupo_id UUID;
  v_campana_id BIGINT;
  v_semana INTEGER;
  v_periodo VARCHAR(10);
BEGIN
  v_doc := p_data->>'documento';
  v_campana_id := (p_data->>'campana_id')::BIGINT;
  v_semana := (p_data->>'semana_trabajo')::INTEGER;
  v_periodo := p_data->>'periodo_reclutado';

  INSERT INTO postulantes (
    documento, tipo_documento, apellido_paterno, apellido_materno, nombres,
    celular, celular_referencia, celular_emergencia, contacto_emergencia, parentesco,
    correo, genero, fecha_nacimiento, estado_civil, n_hijos,
    nivel_academico, carrera, entidad, nacionalidad,
    lugar_residencia, distrito_residencia, direccion_domicilio, lugar_nacimiento,
    updated_at
  ) VALUES (
    v_doc,
    COALESCE(p_data->>'tipo_documento', 'DNI'),
    p_data->>'apellido_paterno',
    p_data->>'apellido_materno',
    p_data->>'nombres',
    p_data->>'celular',
    p_data->>'celular_referencia',
    p_data->>'celular_emergencia',
    p_data->>'contacto_emergencia',
    p_data->>'parentesco',
    p_data->>'correo',
    p_data->>'genero',
    (p_data->>'fecha_nacimiento')::DATE,
    p_data->>'estado_civil',
    (p_data->>'n_hijos')::INTEGER,
    p_data->>'nivel_academico',
    p_data->>'carrera',
    p_data->>'entidad',
    p_data->>'nacionalidad',
    p_data->>'lugar_residencia',
    p_data->>'distrito_residencia',
    p_data->>'direccion_domicilio',
    p_data->>'lugar_nacimiento',
    NOW()
  )
  ON CONFLICT (documento) DO UPDATE SET
    tipo_documento = EXCLUDED.tipo_documento,
    apellido_paterno = EXCLUDED.apellido_paterno,
    apellido_materno = EXCLUDED.apellido_materno,
    nombres = EXCLUDED.nombres,
    celular = EXCLUDED.celular,
    celular_referencia = EXCLUDED.celular_referencia,
    celular_emergencia = EXCLUDED.celular_emergencia,
    contacto_emergencia = EXCLUDED.contacto_emergencia,
    parentesco = EXCLUDED.parentesco,
    correo = EXCLUDED.correo,
    genero = EXCLUDED.genero,
    fecha_nacimiento = EXCLUDED.fecha_nacimiento,
    estado_civil = EXCLUDED.estado_civil,
    n_hijos = EXCLUDED.n_hijos,
    nivel_academico = EXCLUDED.nivel_academico,
    carrera = EXCLUDED.carrera,
    entidad = EXCLUDED.entidad,
    nacionalidad = EXCLUDED.nacionalidad,
    lugar_residencia = EXCLUDED.lugar_residencia,
    distrito_residencia = EXCLUDED.distrito_residencia,
    direccion_domicilio = EXCLUDED.direccion_domicilio,
    lugar_nacimiento = EXCLUDED.lugar_nacimiento,
    updated_at = NOW();

  v_grupo_id := sugerir_grupo_capacitacion(
    v_campana_id,
    v_semana,
    v_periodo,
    p_data->>'grupo_codigo'
  );

  INSERT INTO nominas (
    postulante_documento, reclutador_id, sede_id, campana_id,
    periodo_reclutado, semana_trabajo, fuente_oferta, observacion_reclutamiento,
    exp_call_center, exp_tipo_campana, exp_tiempo_campana, exp_otra, exp_tiempo_otra,
    grupo_id,
    modalidad,
    condicion, horario_gestion, descanso,
    envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0,
    fecha_inicio_capacitacion, fecha_fin_capacitacion,
    fecha_conexion_ojt, fecha_conexion_op,
    pago_capacitacion, fecha_inscripcion_curso,
    fecha_ingreso, tipo_trabajo, tipo_contratacion, razon_social,
    rango_salarial, remuneracion, bono_variable, bono_movilidad,
    bono_bienvenida, bono_permanencia, bono_asistencia_perfecta, cargo_contractual,
    dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs,
    estado,
    activo
  ) VALUES (
    v_doc,
    (p_data->>'reclutador_id')::UUID,
    (p_data->>'sede_id')::INTEGER,
    v_campana_id,
    v_periodo,
    v_semana,
    p_data->>'fuente_oferta',
    p_data->>'observacion_reclutamiento',
    (p_data->>'exp_call_center')::BOOLEAN,
    p_data->>'exp_tipo_campana',
    p_data->>'exp_tiempo_campana',
    p_data->>'exp_otra',
    p_data->>'exp_tiempo_otra',
    v_grupo_id,
    CASE WHEN p_data->>'modalidad' IN ('PRESENCIAL','REMOTO','HIBRIDO') THEN (p_data->>'modalidad')::modalidad_tipo ELSE NULL END,
    p_data->>'condicion',
    p_data->>'horario_gestion',
    p_data->>'descanso',
    COALESCE((p_data->>'envio_dni')::BOOLEAN, FALSE),
    COALESCE((p_data->>'test_psicologico')::BOOLEAN, FALSE),
    COALESCE((p_data->>'validacion_pc')::BOOLEAN, FALSE),
    COALESCE((p_data->>'evaluacion_dia_0')::BOOLEAN, FALSE),
    (p_data->>'fecha_inicio_capacitacion')::DATE,
    (p_data->>'fecha_fin_capacitacion')::DATE,
    (p_data->>'fecha_conexion_ojt')::DATE,
    (p_data->>'fecha_conexion_op')::DATE,
    COALESCE((p_data->>'pago_capacitacion')::BOOLEAN, FALSE),
    (p_data->>'fecha_inscripcion_curso')::DATE,
    (p_data->>'fecha_ingreso')::DATE,
    p_data->>'tipo_trabajo',
    p_data->>'tipo_contratacion',
    p_data->>'razon_social',
    p_data->>'rango_salarial',
    (p_data->>'remuneracion')::NUMERIC,
    (p_data->>'bono_variable')::NUMERIC,
    (p_data->>'bono_movilidad')::NUMERIC,
    (p_data->>'bono_bienvenida')::NUMERIC,
    (p_data->>'bono_permanencia')::NUMERIC,
    (p_data->>'bono_asistencia_perfecta')::NUMERIC,
    p_data->>'cargo_contractual',
    p_data->>'dia_0',
    p_data->>'dia_0_obs',
    p_data->>'status_dia_1',
    p_data->>'dia_1',
    p_data->>'dia_1_obs',
    COALESCE(p_data->>'estado', 'RECLUTADO')::nomina_estado,
    TRUE
  ) RETURNING id INTO v_nomina_id;

  RETURN v_nomina_id;
END;
$$ LANGUAGE plpgsql;
`
    await client.query(sql)
    console.log("Functions recreated successfully!")
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
