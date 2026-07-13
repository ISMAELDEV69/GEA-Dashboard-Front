const fs = require('fs');
const XLSX = require('xlsx');

function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return null;
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  // Add 1 day if necessary or adjust timezone if needed, usually Excel is local timezone.
  // 25569 is Jan 1 1970
  const d = new Date(Math.round((serial - 25569)*86400*1000) + (new Date().getTimezoneOffset() * 60000));
  return d;
}

try {
  const workbook = XLSX.readFile('CARGA_DESCUENTOS.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

  let sql = 'DELETE FROM public.descuentos;\n\n';
  sql += 'INSERT INTO public.descuentos (sede, segmento, grupo_cap, campana, supervisor, formador, dni_ce, postulante, fecha_baja, motivo, comentarios, usuario_carga, fuera_de_plazo, autoriza_jefe_rys, autoriza_jefe_cap, procede, comentario_rys, fecha_envio) VALUES\n';

  const values = [];
  data.forEach((r, idx) => {
    const sede = r['SEDE'] ? `'${String(r['SEDE']).replace(/'/g, "''")}'` : 'NULL';
    const segmento = r['SEGMENTO'] ? `'${String(r['SEGMENTO']).replace(/'/g, "''")}'` : 'NULL';
    const grupo = r['GRUPO DE CAPACITACION'] ? `'${String(r['GRUPO DE CAPACITACION']).replace(/'/g, "''")}'` : 'NULL';
    const campana = r['CAMPAÑA'] ? `'${String(r['CAMPAÑA']).replace(/'/g, "''")}'` : 'NULL';
    const supervisor = r['SUPERVISOR'] ? `'${String(r['SUPERVISOR']).replace(/'/g, "''")}'` : 'NULL';
    const formador = r['FORMADOR'] ? `'${String(r['FORMADOR']).replace(/'/g, "''")}'` : 'NULL';
    const dni = r['DNI O CE'] ? `'${String(r['DNI O CE']).replace(/'/g, "''")}'` : 'NULL';
    const postulante = r['POSTULANTE'] ? `'${String(r['POSTULANTE']).replace(/'/g, "''")}'` : 'NULL';
    
    let fbaja = 'NULL';
    if (r['FECHA DE BAJA/CESE']) {
      const d = excelDateToJSDate(r['FECHA DE BAJA/CESE']);
      if (d && !isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        fbaja = `'${yy}-${mm}-${dd}'`;
      }
    }

    const motivo = r['MOTIVO'] ? `'${String(r['MOTIVO']).replace(/'/g, "''")}'` : 'NULL';
    const autorizaRys = r['AUTORIZA JEFE RYS'] ? `'${String(r['AUTORIZA JEFE RYS']).replace(/'/g, "''")}'` : 'NULL';
    const autorizaCap = r['AUTORIZA JEFE CAP.'] ? `'${String(r['AUTORIZA JEFE CAP.']).replace(/'/g, "''")}'` : 'NULL';
    const procede = r['PROCEDE'] ? `'${String(r['PROCEDE']).replace(/'/g, "''")}'` : 'NULL';
    
    const user = "'saidaquino@admin'";

    values.push(`(${sede}, ${segmento}, ${grupo}, ${campana}, ${supervisor}, ${formador}, ${dni}, ${postulante}, ${fbaja}, ${motivo}, NULL, ${user}, 'NO', ${autorizaRys}, ${autorizaCap}, ${procede}, NULL, NULL)`);
  });

  sql += values.join(',\n') + ';\n';

  fs.writeFileSync('carga_descuentos_final.sql', sql);
  console.log('SQL generated successfully. Total records: ' + values.length);
} catch(err) {
  console.error(err);
}
