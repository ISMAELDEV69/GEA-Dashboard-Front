// src/lib/propuestaParser.js

/**
 * Normaliza cualquier formato de fecha a DD/MM/YYYY (Día primero, luego Mes, luego Año).
 * Soporta YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY o ISO.
 */
export function formatFechaDDMMYYYY(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const day = String(val.getDate()).padStart(2, '0');
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const year = val.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const str = String(val).trim();
  if (!str) return '';

  // 1. Si ya viene DD/MM/YYYY o DD-MM-YYYY (o D/M/YYYY o D/M/YY)
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s].*)?$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    let year = ddmmyyyyMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${day}/${month}/${year}`;
  }

  // 2. Si viene YYYY-MM-DD o YYYY/MM/DD o ISO string
  const yyyymmddMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s].*)?$/);
  if (yyyymmddMatch) {
    const year = yyyymmddMatch[1];
    const month = yyyymmddMatch[2].padStart(2, '0');
    const day = yyyymmddMatch[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  return str;
}

/**
 * Convierte cualquier fecha a formato ISO YYYY-MM-DD para operaciones y comparaciones internas.
 */
export function toIsoDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const str = String(val).trim();
  if (!str) return null;

  // Si viene DD/MM/YYYY o DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s].*)?$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    let year = ddmmyyyy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Si viene YYYY-MM-DD o YYYY/MM/DD
  const yyyymmdd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s].*)?$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str.split('T')[0];
}

/**
 * Convierte un formulario visual de propuesta en un objeto consolidado plano
 * con las 26 columnas canónicas listo para 'propuestas_consolidado'.
 */
export function parsePropuestaToConsolidado(propuesta) {
  let campana = String(propuesta.campana || '').trim();
  let grupo = String(propuesta.grupo || '').trim();

  // Si no vinieron explícitos, intentar extraer del título "CAMPANA - GRUPO"
  if ((!campana || !grupo) && propuesta.titulo && propuesta.titulo.includes('-')) {
    const parts = propuesta.titulo.split('-');
    if (!campana) campana = parts[0].trim();
    if (!grupo) grupo = parts.slice(1).join('-').trim();
  }

  const cod = String(propuesta.cod || (campana && grupo ? `${campana} - ${grupo}` : propuesta.titulo || '')).trim();

  const pPorDia = Number(propuesta.pagoCapaPorDia) || 0;
  const dCapa = Number(propuesta.diasCapa) || 0;
  let pCompleto = Number(propuesta.pagoCapaTotal);
  if (!pCompleto || isNaN(pCompleto) || pCompleto === 0) {
    pCompleto = pPorDia * dCapa;
  }

  const consolidado = {
    periodoCapa: String(propuesta.periodoCapa || '').trim().toUpperCase(),
    semana: String(propuesta.semana || '').trim().toUpperCase(),
    segmento: String(propuesta.segmento || '').trim().toUpperCase(),
    campana: campana.toUpperCase(),
    grupo: grupo.toUpperCase(),
    modalidad: String(propuesta.modalidad || 'REMOTO').trim().toUpperCase(),
    condicionLaboral: String(propuesta.condicionLaboral || 'PLANILLA COMPLETA').trim().toUpperCase(),
    cod: cod.toUpperCase(),
    fechaInicioCapa: formatFechaDDMMYYYY(propuesta.inicio || propuesta.fechaInicioCapa || ''),
    ingresoOperacion: formatFechaDDMMYYYY(propuesta.ingresoOperacion || ''),
    mesAfectacionCapa: String(propuesta.mesAfectacionCapa || '').trim(),
    mesAfectacionBonos: String(propuesta.mesAfectacionBonos || '').trim(),

    // Pagos Capa
    pagoPorDia: pPorDia,
    pagoCompleto: pCompleto,
    diasCapa: dCapa,
    cantDiasFeriados: Number(propuesta.cantDiasFeriados) || 0,

    // Bonos Bienvenida
    bonoBienvenidaM1: Number(propuesta.bBienvenidaM1 ?? propuesta.bonoBienvenidaM1) || 0,
    bonoBienvenidaM2: Number(propuesta.bBienvenidaM2 ?? propuesta.bonoBienvenidaM2) || 0,
    bonoBienvenidaM3: Number(propuesta.bBienvenidaM3 ?? propuesta.bonoBienvenidaM3) || 0,

    // Bonos Permanencia
    bonoPermanenciaM1: Number(propuesta.bPermM1 ?? propuesta.bonoPermanenciaM1) || 0,
    bonoPermanenciaM2: Number(propuesta.bPermM2 ?? propuesta.bonoPermanenciaM2) || 0,
    bonoPermanenciaM3: Number(propuesta.bPermM3 ?? propuesta.bonoPermanenciaM3) || 0,
    bonoPermanenciaM4: Number(propuesta.bPermM4 ?? propuesta.bonoPermanenciaM4) || 0,

    // Bonos Asistencia Perfecta
    bonoAsistenciaM1: Number(propuesta.bAsisM1 ?? propuesta.bonoAsistenciaM1) || 0,
    bonoAsistenciaM2: Number(propuesta.bAsisM2 ?? propuesta.bonoAsistenciaM2) || 0,
    bonoAsistenciaM3: Number(propuesta.bAsisM3 ?? propuesta.bonoAsistenciaM3) || 0,
  };

  // Solo incluir id si es un UUID válido para evitar error de NOT NULL o casteo
  if (propuesta.id && String(propuesta.id).length > 20) {
    consolidado.id = propuesta.id;
  }

  return consolidado;
}
