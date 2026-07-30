const xlsx = require('xlsx');
const fs = require('fs');

const wb = xlsx.readFile('CARGA NOMINA RETENCIONES FIJA/SEMANA 27 - RETEFIJA.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);

function escape(str) {
  if (str === null || str === undefined || str === '') return 'NULL';
  if (typeof str === 'number') return str;
  if (typeof str === 'boolean') return str;
  return "'" + String(str).replace(/'/g, "''").trim() + "'";
}

function formatDate(serial) {
  if (!serial) return 'NULL';
  if (typeof serial === 'string') {
    const parts = serial.split('/');
    if (parts.length === 3) return `'${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}'`;
    return `'${serial}'`;
  }
  const utc_days  = Math.floor(serial - 25569);
  const date = new Date(utc_days * 86400 * 1000);
  return `'${date.toISOString().split('T')[0]}'`;
}

function getVal(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  return null;
}

let sql = '';
for (const row of data) {
  if (!getVal(row, ['Nro de DNI o C.E.'])) continue;

  const cols = [
    'documento', 'periodo_reclutado', 'semana_trabajo', 'reclutador', 'sede', 'tipo_documento', 
    'apellido_paterno', 'apellido_materno', 'nombres', 'celular', 'celular_referencia', 'correo', 
    'genero', 'fecha_nacimiento', 'estado_civil', 'n_hijos', 'nivel_academico', 'carrera', 
    'nacionalidad', 'lugar_residencia', 'distrito_residencia', 'direccion_domicilio', 
    'exp_call_center', 'exp_tipo_campana', 'exp_tiempo_call', 'exp_otra', 'exp_tiempo_otra', 
    'fuente_oferta', 'observacion_reclutamiento', 'campana', 'grupo_codigo', 'modalidad', 
    'condicion', 'horario_gestion', 'descanso', 'envio_dni', 'test_psicologico', 'validacion_pc', 
    'evaluacion_dia_0', 'fecha_inicio_capacitacion', 'fecha_fin_capacitacion', 'fecha_conexion_ojt', 
    'fecha_conexion_op', 'pago_capacitacion', 'tipo_contratacion', 'razon_social', 'remuneracion', 
    'bono_variable', 'bono_movilidad', 'bono_bienvenida', 'bono_permanencia', 'bono_asistencia_perfecta', 
    'cargo_contractual', 'dia_0', 'dia_0_obs', 'status_dia_1', 'dia_1', 'dia_1_obs', 
    'doc_cv', 'doc_dni_adjunto', 'doc_certijoven', 'doc_recibo_servicios', 'doc_ficha_datos', 
    'doc_autorizacion', 'status_final', 'observacion_final', 'created_at', 'updated_at', 
    'activo', 'edad', 'marca_temporal', 'evaluar', 'obs_evaluar', 
    'validacion_reingreso', 'fecha_validacion', 'observacion_reingreso'
  ];

  const vals = [
    escape(getVal(row, ['Nro de DNI o C.E.'])), // documento
    escape(getVal(row, ['PERIODO RECLUTADO'])), // periodo
    escape(String(getVal(row, ['SEMANA DE TRABAJO']) || '').replace(/\\D/g, '') || null), // semana
    escape(getVal(row, ['RECLUTADOR'])),
    escape(getVal(row, ['SEDE'])),
    escape(getVal(row, ['TIPO DE DOCUMENTO'])),
    escape(getVal(row, ['APELLIDO PATERNO'])),
    escape(getVal(row, ['APELLIDO MATERNO'])),
    escape(getVal(row, ['NOMBRES COMPLETOS'])),
    escape(getVal(row, ['NÚMERO DE CELULAR / MÓVIL'])),
    escape(getVal(row, ['NÚMERO DE CELULAR DE REFERENCIA'])),
    escape(getVal(row, ['CORREO ELECTRONICO'])),
    escape(getVal(row, ['GÉNERO O SEXO DEL POSTULANTE'])),
    formatDate(getVal(row, ['FECHA DE NACIMIENTO'])),
    escape(getVal(row, ['ESTADO CIVIL'])),
    escape(getVal(row, ['N° de HIJOS']) || 0),
    escape(getVal(row, ['NIVEL ACADÉMICO'])),
    escape(getVal(row, ['MENCIONAR CARREA'])),
    escape(getVal(row, ['NACIONALIDAD'])),
    escape(getVal(row, ['LUGAR DE RESIDENCIA ACTUAL'])),
    escape(getVal(row, ['DISTRITO DE RESIDENCIA'])),
    escape(getVal(row, ['DIRECCIÓN DE DOMICILIO ACTUAL'])),
    escape(getVal(row, ['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?\\r\\n'])),
    escape(getVal(row, ['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'])),
    escape(getVal(row, ['TIEMPO DE EXPERIENCIA'])),
    escape(getVal(row, ['DETALLANOS OTRA EXPERIENCIA LABORAL'])),
    escape(getVal(row, ['TIEMPO DE EXPERIENCIA_1'])), // Excel adds _1 for duplicate headers
    escape(getVal(row, ['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?\\r\\n'])),
    escape(getVal(row, ['OBSERVACION'])),
    escape(getVal(row, ['CAMPAÑA'])),
    escape(getVal(row, ['GRUPO(G000)'])),
    escape(getVal(row, ['MODALIDAD'])),
    escape(getVal(row, [' '])), // CONDICION
    escape(getVal(row, ['HORARIO DE GESTIÓN'])),
    escape(getVal(row, ['DESCANSO'])),
    escape(getVal(row, ['ENVIO DNI'])),
    escape(getVal(row, ['TEST PSICOLOGICO'])),
    escape(getVal(row, ['VALIDACION DE PC '])),
    escape(getVal(row, ['EVALUACION DIA 0'])),
    formatDate(getVal(row, ['INICIO DE CAPACITACIÓN'])),
    formatDate(getVal(row, ['FIN DE CAPACITACIÓN'])),
    formatDate(getVal(row, ['CONEXIÓN OJT '])),
    formatDate(getVal(row, ['CONEXIÓN OP'])),
    escape(getVal(row, ['PAGO DE CAPACITACIÓN']) || 0),
    escape(getVal(row, ['TIPO DE CONTRATACIÓN'])),
    escape(getVal(row, ['RAZON SOCIAL'])),
    escape(getVal(row, ['REMUNERACION']) || 0),
    escape(getVal(row, ['BONO 1 (VARIABLE)']) || 0),
    '0', // bono_movilidad not in sheet
    escape(getVal(row, ['BONO 2 (BIENVENIDA)']) || 0),
    escape(getVal(row, ['BONO 4 (PERMANENCIA)']) || 0),
    escape(getVal(row, ['BONO 5 (ASISTENCIA PERFECTA)']) || 0),
    escape(getVal(row, ['CARGO CONTRACTUAL'])),
    escape(getVal(row, ['DIA 0'])),
    escape(getVal(row, ['OBSERVACIONES'])),
    escape(getVal(row, ['STATUS DIA 1'])),
    escape(getVal(row, ['DIA 1'])),
    escape(getVal(row, ['OBSERVACIONES_1'])),
    escape(getVal(row, ['CV '])),
    escape(getVal(row, ['DNI '])),
    escape(getVal(row, ['CERTIJOVEN/ CERTIADULTO '])),
    escape(getVal(row, ['RECIBO DE SERVICIOS '])),
    escape(getVal(row, ['FICHA DE DATOS '])),
    escape(getVal(row, ['FORM. AUTORIZACION DE DATOS'])),
    escape(getVal(row, ['STATUS'])), // status_final
    escape(getVal(row, ['OBSERVACION '])), // observacion_final
    'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP', 'true',
    escape(getVal(row, ['EDAD']) || 0),
    'CURRENT_TIMESTAMP',
    escape(getVal(row, ['EVALUAR'])),
    escape(getVal(row, ['OBS EVALUAR'])),
    escape(getVal(row, ['VALIDACION DE REINGRESO'])),
    formatDate(getVal(row, ['FECHA DE VALIDACIÓN'])),
    'NULL' // observacion_reingreso
  ];

  sql += `INSERT INTO public.nominas (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
}

fs.writeFileSync('inserts_semana_27.sql', sql);
console.log('SQL generated successfully in inserts_semana_27.sql');
