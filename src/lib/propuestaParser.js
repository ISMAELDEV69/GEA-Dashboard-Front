// src/lib/propuestaParser.js

/**
 * Convierte un formulario visual de propuesta (que ahora usa campos específicos)
 * en un objeto consolidado plano listo para la tabla 'propuestas_consolidado'.
 */
export function parsePropuestaToConsolidado(propuesta) {
  // Segmento / Campaña
  // Si el título es "CONTACTADOS - COMAS", dividimos.
  let campana = propuesta.titulo || '';
  let grupo = '';
  if (campana.includes('-')) {
    const parts = campana.split('-');
    campana = parts[0].trim();
    grupo = parts[1].trim();
  }

  return {
    id: propuesta.id, // Puede venir nulo si es nuevo
    periodoCapa: propuesta.periodoCapa || '',
    semana: propuesta.semana || '',
    segmento: propuesta.segmento || '',
    campana: campana,
    grupo: grupo,
    modalidad: propuesta.modalidad || 'Remoto',
    condicionLaboral: propuesta.condicionLaboral || 'Planilla Completa',
    cod: propuesta.cod || '',
    fechaInicioCapa: propuesta.inicio || '',
    ingresoOperacion: propuesta.ingresoOperacion || '',
    mesAfectacionCapa: propuesta.mesAfectacionCapa || '',
    mesAfectacionBonos: propuesta.mesAfectacionBonos || '',
    
    // Pagos Capa
    pagoPorDia: Number(propuesta.pagoCapaPorDia) || 0,
    pagoCompleto: Number(propuesta.pagoCapaTotal) || 0,
    diasCapa: Number(propuesta.diasCapa) || 0,
    cantDiasFeriados: Number(propuesta.cantDiasFeriados) || 0,
    
    // Bonos
    bonoBienvenidaM1: Number(propuesta.bBienvenidaM1) || 0,
    bonoBienvenidaM2: Number(propuesta.bBienvenidaM2) || 0,
    bonoBienvenidaM3: Number(propuesta.bBienvenidaM3) || 0,
    
    bonoPermanenciaM1: Number(propuesta.bPermM1) || 0,
    bonoPermanenciaM2: Number(propuesta.bPermM2) || 0,
    bonoPermanenciaM3: Number(propuesta.bPermM3) || 0,
    bonoPermanenciaM4: Number(propuesta.bPermM4) || 0,
    
    bonoAsistenciaM1: Number(propuesta.bAsisM1) || 0,
    bonoAsistenciaM2: Number(propuesta.bAsisM2) || 0,
    bonoAsistenciaM3: Number(propuesta.bAsisM3) || 0,
  };
}
