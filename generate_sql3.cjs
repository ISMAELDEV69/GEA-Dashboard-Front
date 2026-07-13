const xlsx = require('xlsx');
const fs = require('fs');

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number') return str;
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function parseMoney(val) {
  if (!val) return null;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function excelDateToJSDate(serial) {
  if (serial === null || serial === undefined || serial === '' || serial === '-') return null;
  
  if (typeof serial === 'string') {
    const parts = serial.split('/');
    if (parts.length === 3) {
      let [p1, p2, y] = parts;
      let m = p1, d = p2;
      if (parseInt(p1) > 12) {
         m = p2; d = p1;
      }
      const res = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      if (res.startsWith('18') || res.startsWith('190')) return null;
      return res;
    }
    if (serial.includes('-')) {
      if (serial.startsWith('18') || serial.startsWith('190')) return null;
      return serial;
    }
    if (!isNaN(serial)) {
        serial = Number(serial);
    } else {
        return null;
    }
  }
  
  if (typeof serial === 'number') {
    if (serial <= 100) return null; // Avoid 1900-01-00 or empty 0 values
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;                                        
    const date_info = new Date(utc_value * 1000);
    const result = date_info.toISOString().split('T')[0];
    if (result.startsWith('18') || result.startsWith('190')) return null; // Filter out 1899/1900 epoch bugs
    return result;
  }
  
  return null;
}

const wb = xlsx.readFile('NOMINA SEMANA 21 CARGA.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = xlsx.utils.sheet_to_json(ws, { defval: null });

const postulantesMap = new Map();

for (const row of rawData) {
  const documento = (row['Nro de DNI o C.E.'] || '').toString().trim();
  if (!documento) continue;

  postulantesMap.set(documento, {
    documento,
    periodo_reclutado: (row['PERIODO RECLUTADO'] || '').toString().trim(),
    semana_trabajo: parseInt(row['SEMANA DE TRABAJO']) || 21,
    reclutador: (row['RECLUTADOR'] || '').toString().trim().toUpperCase(),
    sede: (row['SEDE'] || '').toString().trim().toUpperCase(),
    tipo_documento: (row['TIPO DE DOCUMENTO'] || 'DNI').toUpperCase(),
    apellido_paterno: (row['APELLIDO PATERNO'] || '').toString().trim().toUpperCase(),
    apellido_materno: (row['APELLIDO MATERNO\r\n'] || row['APELLIDO MATERNO'] || '').toString().trim().toUpperCase(),
    nombres: (row['NOMBRES COMPLETOS'] || '').toString().trim().toUpperCase(),
    celular: (row['NÚMERODECELULAR/MÓVIL'] || '').toString().trim(),
    celular_referencia: (row['NÚMERODECELULARDEREFERENCIA'] || '').toString().trim(),
    correo: (row['CORREO ELECTRONICO'] || '').toString().trim().toLowerCase(),
    genero: (row['GÉNERO O SEXO DEL POSTULANTE'] || '').toString().trim().toUpperCase(),
    fecha_nacimiento: excelDateToJSDate(row['FECHA DE NACIMIENTO']),
    edad: parseInt(row['EDAD']) || null,
    estado_civil: (row['ESTADO CIVIL'] || '').toString().trim().toUpperCase(),
    n_hijos: parseInt(row['N° de HIJOS']) || 0,
    nivel_academico: (row['NIVEL ACADÉMICO'] || '').toString().trim().toUpperCase(),
    carrera: (row['MENCIONAR CARREA'] || '').toString().trim().toUpperCase(),
    nacionalidad: (row['NACIONALIDAD'] || '').toString().trim().toUpperCase(),
    lugar_residencia: (row['LUGAR DE RESIDENCIA ACTUAL'] || '').toString().trim().toUpperCase(),
    distrito_residencia: (row['DISTRITO DE RESIDENCIA'] || '').toString().trim().toUpperCase(),
    direccion_domicilio: (row['DIRECCIÓN DE DOMICILIO ACTUAL'] || '').toString().trim().toUpperCase(),
    exp_call_center: (row['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?\r\n'] || row['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?'] || '').toString().trim().toUpperCase(),
    exp_tipo_campana: (row['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'] || '').toString().trim().toUpperCase(),
    exp_tiempo_call: (row['TIEMPO DE EXPERIENCIA'] || '').toString().trim().toUpperCase(),
    exp_otra: (row['DETALLANOS OTRA EXPERIENCIA LABORAL'] || '').toString().trim().toUpperCase(),
    exp_tiempo_otra: (row['TIEMPO DE EXPERIENCIA_1'] || '').toString().trim().toUpperCase(),
    fuente_oferta: (row['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?\r\n'] || '').toString().trim().toUpperCase(),
    observacion_reclutamiento: (row['OBSERVACION'] || '').toString().trim(),
    campana: (row['CAMPAÑA'] || '').toString().trim().toUpperCase(),
    grupo_codigo: (row['GRUPO(G000)'] || '').toString().trim().toUpperCase(),
    modalidad: (row['MODALIDAD'] || 'PRESENCIAL').toUpperCase(),
    condicion: (row['CONDICIÓN'] || 'FULL TIME').toUpperCase(),
    horario_gestion: row['HORARIO DE GESTIÓN'] || null,
    descanso: (row['DESCANSO'] || '').toString().trim().toUpperCase(),
    envio_dni: (row['ENVIO DNI'] || '').toString().trim().toUpperCase(),
    test_psicologico: (row['TEST PSICOLOGICO'] || '').toString().trim().toUpperCase(),
    validacion_pc: (row['VALIDACION DE PC'] || '').toString().trim().toUpperCase(),
    evaluacion_dia_0: (row['EVALUACION DIA 0'] || '').toString().trim().toUpperCase(),
    fecha_inicio_capacitacion: excelDateToJSDate(row['INICIO DE CAPACITACIÓN']),
    fecha_fin_capacitacion: excelDateToJSDate(row['FIN DE CAPACITACIÓN']),
    fecha_conexion_ojt: excelDateToJSDate(row['CONEXIÓN OJT']),
    fecha_conexion_op: excelDateToJSDate(row['CONEXIÓN OP']),
    pago_capacitacion: (row['PAGO DE CAPACITACIÓN'] || '').toString().trim(),
    tipo_contratacion: (row['TIPO DE CONTRATACIÓN'] || '').toString().trim().toUpperCase(),
    razon_social: (row['RAZON SOCIAL'] || '').toString().trim().toUpperCase(),
    remuneracion: parseMoney(row['REMUNERACION']),
    bono_variable: parseMoney(row['BONO 1 (VARIABLE)']),
    bono_movilidad: parseMoney(row['BONO 2 (MOVILIDAD)']),
    bono_bienvenida: parseMoney(row['BONO 3 (BIENVENIDA)']),
    bono_permanencia: parseMoney(row['BONO 4 (PERMANENCIA)']),
    bono_asistencia_perfecta: parseMoney(row['BONO 5 (ASISTENCIA PERFECTA)']),
    cargo_contractual: (row['CARGO CONTRACTUAL'] || '').toString().trim().toUpperCase(),
    dia_0: (row['DIA 0'] || '').toString().trim().toUpperCase(),
    dia_0_obs: (row['OBSERVACIONES'] || '').toString().trim(),
    status_dia_1: (row['STATUS DIA 1'] === 0 ? 'APTO' : (row['STATUS DIA 1'] || 'APTO')).toString().toUpperCase(),
    dia_1: (row['DIA 1'] || '').toString().trim().toUpperCase(),
    dia_1_obs: (row['OBSERVACIONES_1'] || '').toString().trim(),
  });
}

const postulantesToInsert = Array.from(postulantesMap.values());

let sql = `-- Eliminar registros previos en nominas para evitar duplicados\n`;
sql += `DELETE FROM nominas WHERE documento IN (${postulantesToInsert.map(p => escapeSql(p.documento)).join(', ')});\n`;

sql += `\n-- Inserciones en nominas (solo postulantes)\n`;
for (const p of postulantesToInsert) {
  const cols = Object.keys(p).join(', ');
  const vals = Object.values(p).map(v => escapeSql(v)).join(', ');
  sql += `INSERT INTO nominas (${cols}) VALUES (${vals});\n`;
}

fs.writeFileSync('carga_nomina.sql', sql);
