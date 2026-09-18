/**
 * Reglas de Baja Día 1 para Marcación y Regularizar (no aplica al editor admin de celda).
 *
 * Regular / APTO: solo el Día 1 del grupo.
 * Agregado u observado: Día 1 y Día 2.
 * Recuperado CAP: no se marca como Baja Día 1 y no cuenta en deserción.
 */

function cleanUpper(val) {
  return String(val || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function profileBlob(row = {}) {
  return [
    row.tipo_reclutado,
    row.tipoReclutado,
    row.tipo,
    row.status_dia_1,
    row.statusDia1,
    row.observacion_estado,
    row.observacion_dia_1,
    row.estado,
  ].map(cleanUpper).join(' ')
}

export function isBajaDia1Motivo(motivo) {
  const m = cleanUpper(motivo)
  if (!m) return false
  return (
    m.includes('BAJA DIA 1') ||
    m.includes('BAJA D1') ||
    m.includes('PERIODO GRACIA')
  )
}

export function isRecuperadoCapProfile(row = {}) {
  const blob = profileBlob(row)
  return (
    blob.includes('RECUPERADO CAP') ||
    blob.includes('RECUPERO CAP') ||
    blob.includes('RECUPERADO_CAP') ||
    blob.includes('RECUPERO_CAP')
  )
}

export function isAgregadoObservadoProfile(row = {}) {
  if (isRecuperadoCapProfile(row)) return false
  const blob = profileBlob(row)
  return blob.includes('AGREGADO') || blob.includes('OBSERVAD')
}

export function canAssignBajaDia1({ trainingDayIndex = 0, row = {}, existingMotivo = '' } = {}) {
  if (isBajaDia1Motivo(existingMotivo)) return true
  if (isRecuperadoCapProfile(row)) return false
  const day = Number(trainingDayIndex) || 0
  if (day < 1) return false
  if (isAgregadoObservadoProfile(row)) return day <= 2
  return day === 1
}

export function defaultBajaMotivo(params) {
  return canAssignBajaDia1(params) ? 'BAJA DIA 1' : 'DESERCIÓN'
}

export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '' } = {}) {
  if (!isBajaDia1Motivo(motivo)) return motivo || ''
  if (isBajaDia1Motivo(previousMotivo)) return motivo
  if (canAssignBajaDia1({ trainingDayIndex, row, existingMotivo: '' })) return motivo
  return 'DESERCIÓN'
}

export function countsInFormacionDesercion(row = {}, motivo = '') {
  if (isRecuperadoCapProfile(row)) return false
  if (isBajaDia1Motivo(motivo)) return false
  return true
}
