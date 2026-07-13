const fs = require('fs');
const XLSX = require('xlsx');

function excelDateToJSDate(serial) {
  if (typeof serial !== 'number' && typeof serial !== 'string') return null;
  if (typeof serial === 'string') {
    const d = new Date(serial);
    if (!isNaN(d.getTime())) return d;
    return null;
  }
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const d = new Date(Math.round((serial - 25569)*86400*1000) + (new Date().getTimezoneOffset() * 60000));
  return d;
}

function safeString(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return `'${String(val).replace(/'/g, "''").trim()}'`;
}

function safeDate(val) {
  if (!val) return 'NULL';
  const d = excelDateToJSDate(val);
  if (d && !isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `'${yy}-${mm}-${dd}'`;
  }
  return 'NULL';
}

function safeTimestamp(val) {
  if (!val) return 'NULL';
  const d = excelDateToJSDate(val);
  if (d && !isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `'${yy}-${mm}-${dd} ${hh}:${min}:${ss}'`;
  }
  return 'NULL';
}

try {
  const workbook = XLSX.readFile('CARGA DESCUENTOS.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

  let sql = 'DELETE FROM public.descuentos;\n\n';
  sql += 'INSERT INTO public.descuentos (sede, segmento, grupo_cap, campana, supervisor, formador, dni_ce, postulante, fecha_baja, motivo, comentarios, autoriza_rys, autoriza_cap, procede, bono, comentario_rys, usuario_registro, fecha_registro, usuario_autoriza, fecha_autorizacion, fuera_de_plazo) VALUES\n';

  const values = [];
  data.forEach((r, idx) => {
    if (!r['DNI O CE']) return;

    const sede = safeString(r['SEDE']);
    const segmento = safeString(r['SEGMENTO']);
    const grupo = safeString(r['GRUPO DE CAPACITACION']);
    const campana = safeString(r['CAMPAÑA']);
    const supervisor = safeString(r['SUPERVISOR']);
    const formador = safeString(r['FORMADOR']);
    const dni = safeString(r['DNI O CE']);
    const postulante = safeString(r['POSTULANTE']);
    const fecha_baja = safeDate(r['FECHA DE BAJA/CESE']);
    const motivo = safeString(r['MOTIVO']);
    const comentarios = safeString(r['COMENTARIOS']);
    const autorizaRys = safeString(r['AUTORIZA JEFE RYS']);
    const autorizaCap = safeString(r['AUTORIZA JEFE CAP.']);
    const procede = safeString(r['PROCEDE']);
    const bono = safeString(r['BONO']);
    const comentarioRys = safeString(r['COMENTARIO RYS']);
    const usuarioPortal = safeString(r['USUARIO PORTAL']);
    const fechaEnvio = safeTimestamp(r['FECHA DE ENVIO']);
    const usuarioAutoriza = safeString(r['USUARIO PORTAL AUTORIZA']);
    const fechaAutoriza = safeTimestamp(r['FECHA DE AUTORIZACION']);
    const fueraPlazo = safeString(r['FUERA DE PLAZO']);
    
    values.push(`(${sede}, ${segmento}, ${grupo}, ${campana}, ${supervisor}, ${formador}, ${dni}, ${postulante}, ${fecha_baja}, ${motivo}, ${comentarios}, ${autorizaRys}, ${autorizaCap}, ${procede}, ${bono}, ${comentarioRys}, ${usuarioPortal}, ${fechaEnvio}, ${usuarioAutoriza}, ${fechaAutoriza}, ${fueraPlazo})`);
  });

  sql += values.join(',\n') + ';\n';

  fs.writeFileSync('carga_descuentos_generado.sql', sql);
  console.log('SQL generated successfully in carga_descuentos_generado.sql. Total records: ' + values.length);
} catch(err) {
  console.error(err);
}
