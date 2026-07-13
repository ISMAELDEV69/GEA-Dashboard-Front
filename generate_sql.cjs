const xlsx = require('xlsx');
const fs = require('fs');

function excelDateToJSDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') {
    const parts = serial.split('/');
    if (parts.length === 3) {
      const [m, d, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
  }
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}

function parseMoney(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number') return str;
  return "'" + String(str).replace(/'/g, "''") + "'";
}

const wb = xlsx.readFile('NOMINA SEMANA 21 CARGA.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = xlsx.utils.sheet_to_json(ws, { defval: null });

const groupsSet = new Set();
const groupsToInsert = [];
const postulantesToInsert = [];

for (const row of rawData) {
  const documento = (row['Nro de DNI o C.E.'] || '').toString().trim();
  if (!documento) continue;

  const campana = (row['CAMPAÑA'] || '').toString().trim().toUpperCase();
  const grupo = (row['GRUPO(G000)'] || '').toString().trim().toUpperCase();
  
  const groupKey = `${campana}|${grupo}`;
  if (!groupsSet.has(groupKey)) {
    groupsSet.add(groupKey);
    groupsToInsert.push({
      codigo: grupo,
      campana: campana,
      fecha_registro: excelDateToJSDate(row['INICIO DE CAPACITACIÓN']) || new Date().toISOString().split('T')[0],
      periodo: (row['PERIODO RECLUTADO'] || '').toString().trim(),
      modalidad: (row['MODALIDAD'] || 'PRESENCIAL').toUpperCase(),
      condicion: (row['CONDICIÓN'] || 'FULL TIME').toUpperCase(),
      rango_horario: row['HORARIO DE GESTIÓN'] || null,
      estado: 'PLANIFICADO'
    });
  }

  postulantesToInsert.push({
    documento,
    tipo_documento: (row['TIPO DE DOCUMENTO'] || 'DNI').toUpperCase(),
    apellido_paterno: (row['APELLIDO PATERNO'] || '').toString().trim().toUpperCase(),
    apellido_materno: (row['APELLIDO MATERNO\r\n'] || row['APELLIDO MATERNO'] || '').toString().trim().toUpperCase(),
    nombres: (row['NOMBRES COMPLETOS'] || '').toString().trim().toUpperCase(),
    celular: (row['NÚMERODECELULAR/MÓVIL'] || '').toString().trim(),
    celular_referencia: (row['NÚMERODECELULARDEREFERENCIA'] || '').toString().trim(),
    correo: (row['CORREO ELECTRONICO'] || '').toString().trim().toLowerCase(),
    genero: (row['GÉNERO O SEXO DEL POSTULANTE'] || '').toString().trim().toUpperCase(),
    estado_civil: (row['ESTADO CIVIL'] || '').toString().trim().toUpperCase(),
    n_hijos: parseInt(row['N° de HIJOS']) || 0,
    reclutador: (row['RECLUTADOR'] || '').toString().trim().toUpperCase(),
    sede: (row['SEDE'] || '').toString().trim().toUpperCase(),
    campana: campana,
    grupo_codigo: grupo,
    periodo_reclutado: (row['PERIODO RECLUTADO'] || '').toString().trim(),
    semana_trabajo: parseInt(row['SEMANA DE TRABAJO']) || 21,
    modalidad: (row['MODALIDAD'] || 'PRESENCIAL').toUpperCase(),
    condicion: (row['CONDICIÓN'] || 'FULL TIME').toUpperCase(),
    horario_gestion: row['HORARIO DE GESTIÓN'] || null,
    remuneracion: parseMoney(row['REMUNERACION']),
    bono_variable: parseMoney(row['BONO 1 (VARIABLE)']),
    bono_bienvenida: parseMoney(row['BONO 3 (BIENVENIDA)']),
    status_dia_1: (row['STATUS DIA 1'] === 0 ? 'APTO' : (row['STATUS DIA 1'] || 'APTO')).toString().toUpperCase()
  });
}

let sql = `-- Inserciones en capacidad_rys\n`;
for (const g of groupsToInsert) {
  if (!g.codigo || !g.campana) continue;
  sql += `INSERT INTO capacidad_rys (codigo, campana, fecha_registro, periodo, modalidad, condicion, rango_horario, estado) VALUES (${escapeSql(g.codigo)}, ${escapeSql(g.campana)}, ${escapeSql(g.fecha_registro)}, ${escapeSql(g.periodo)}, ${escapeSql(g.modalidad)}, ${escapeSql(g.condicion)}, ${escapeSql(g.rango_horario)}, ${escapeSql(g.estado)}) ON CONFLICT (codigo) DO UPDATE SET fecha_registro=EXCLUDED.fecha_registro, periodo=EXCLUDED.periodo, modalidad=EXCLUDED.modalidad, condicion=EXCLUDED.condicion, rango_horario=EXCLUDED.rango_horario;\n`;
}

sql += `\n-- Inserciones en nominas\n`;
for (const p of postulantesToInsert) {
  const cols = Object.keys(p).join(', ');
  const vals = Object.values(p).map(v => escapeSql(v)).join(', ');
  sql += `INSERT INTO nominas (${cols}) VALUES (${vals}) ON CONFLICT (documento) DO UPDATE SET ${Object.keys(p).map(k => `${k}=EXCLUDED.${k}`).join(', ')};\n`;
}

fs.writeFileSync('carga_nomina.sql', sql);
console.log('SQL generado en carga_nomina.sql');
