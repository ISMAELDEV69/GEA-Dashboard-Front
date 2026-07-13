/**
 * Fuentes publicadas de Google Sheets — nómina y asistencia operativa GEA
 * Las URLs pubhtml exportan CSV con ?output=csv
 */

export const SHEET_SOURCES = {
  nomina_sem25: {
    id: 'nomina_sem25',
    label: 'SEMANA 25 — Nómina consolidado',
    description: 'Plantilla oficial con 68 columnas, respuestas Google Form y día 0 / día 1',
    pubId: '2PACX-1vQK6cF6f25tguIZUQyj5Azxp1fJ7p9br32hfwjvAKzhAuW10OcCjKNOi4FoHsMwbkPxz_7dtvLegVh-',
    gid: null,
    localFile: 'scripts/sheet_nomina_sem25.csv',
    defaults: {
      periodo: '202606',
      semana: 25,
      reclutador: 'Cardenas Angeles Pierina Alejandra',
    },
    importAsistencia: true,
    pubhtml: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQK6cF6f25tguIZUQyj5Azxp1fJ7p9br32hfwjvAKzhAuW10OcCjKNOi4FoHsMwbkPxz_7dtvLegVh-/pubhtml',
  },
  asistencia_sem25: {
    id: 'asistencia_sem25',
    label: 'ASISTENCIA SEM 25 (operativo)',
    description: 'Listado operativo de capacitación — ~500 postulantes con asistencia día 0',
    pubId: '2PACX-1vQssMHy3RNTmi-LIARB-dGaZSfeyjk86_5mOFT0y4eULPPhXXqdVxd5q2ko4C1yDOEf-_xdo9O2BHQr',
    gid: 0,
    localFile: 'scripts/sheet_asistencia_sem25_gid0.csv',
    defaults: {
      periodo: '202606',
      semana: 25,
      reclutador: 'IMPORTACION ASISTENCIA SEM 25',
    },
    importAsistencia: true,
    pubhtml: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQssMHy3RNTmi-LIARB-dGaZSfeyjk86_5mOFT0y4eULPPhXXqdVxd5q2ko4C1yDOEf-_xdo9O2BHQr/pubhtml',
  },
}

/** Fuente principal preseleccionada en el panel Admin */
export const PRIMARY_SHEET_ID = 'nomina_sem25'

export function sheetCsvUrl(source) {
  const base = `https://docs.google.com/spreadsheets/d/e/${source.pubId}/pub`
  if (source.gid != null) {
    return `${base}?gid=${source.gid}&single=true&output=csv`
  }
  return `${base}?output=csv`
}

export function inferSegmento(campanaName) {
  const c = campanaName?.toUpperCase() || ''
  if (c.includes('CONTACTADOS') || c.includes('RETENCIONES INBOUND')) return 'CLARO PERU RETENCIONES'
  if (c.includes('CLARO POSTPAGO') || c.includes('CLARO PREPAGO') || c.includes('CLARO PREMIUM') || c.includes('CLARO ROAMING')) return 'CLARO PERU'
  if (c.includes('POSTPAGO') || c.includes('VTR') || c.includes('RETENCIONES CHILE')) return 'CLARO CHILE'
  if (c.includes('UPGRADE') || c.includes('MIGRACIONES') || c.includes('RENOVACIONES')) return 'CLARO PERU OUT'
  return 'CLARO PERU'
}
