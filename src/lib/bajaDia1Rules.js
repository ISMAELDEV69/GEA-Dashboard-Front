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
  if (isRecuperadoCapProfile(row)) return false
  const day = Number(trainingDayIndex) || 0
  // REGLA ESTRICTA: Solamente en el Día 1 del grupo se permite asignar 'BAJA DIA 1'.
  // En Día 2 o posteriores NUNCA se permite asignar 'BAJA DIA 1'.
  return day === 1
}

export function defaultBajaMotivo(params = {}) {
  // Si el postulante ya tiene un motivo de baja previo registrado (ej. 'BAJA DIA 1'),
  // ese motivo original se MANTIENE INMUTABLE hasta el último registro del grupo.
  const prev = params?.previousMotivo || params?.existingMotivo || params?.row?.pastMotive || params?.row?.motivo_baja || ''
  if (prev && String(prev).trim()) {
    return String(prev).trim()
  }
  const day = Number(params?.trainingDayIndex) || 0
  if (day === 1) return 'BAJA DIA 1'
  return 'DESERCIÓN'
}

export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '' } = {}) {
  // Si la persona ya tiene un motivo previo consolidado (ej. BAJA DIA 1 registrada en el Día 1),
  // se preserva ese motivo hasta el último registro sin mutar a DESERCIÓN.
  if (previousMotivo && String(previousMotivo).trim()) {
    return String(previousMotivo).trim()
  }
  if (!isBajaDia1Motivo(motivo)) return motivo || ''
  const day = Number(trainingDayIndex) || 0
  // Si estamos en Día 1 y no es perfil recuperado cap, se permite BAJA DIA 1
  if (day === 1 && !isRecuperadoCapProfile(row)) return 'BAJA DIA 1'
  // Si es un cese nuevo originado en Día 2 en adelante, no puede ser BAJA DIA 1 (se asigna DESERCIÓN)
  return 'DESERCIÓN'
}

export function countsInFormacionDesercion(row = {}, motivo = '') {
  if (isRecuperadoCapProfile(row)) return false
  if (isBajaDia1Motivo(motivo)) return false
  return true
}
