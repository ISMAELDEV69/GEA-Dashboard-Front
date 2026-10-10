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
  const prev = params?.previousMotivo || params?.existingMotivo || params?.row?.pastMotive || params?.row?.motivo_baja || ''
  if (prev && String(prev).trim()) {
    const cleanPrev = String(prev).trim()
    if (isBajaDia1Motivo(cleanPrev) && isRecuperadoCapProfile(params?.row)) {
      return 'DESERCIÓN'
    }
    return cleanPrev
  }
  const day = Number(params?.trainingDayIndex) || 0
  if (day === 1 && !isRecuperadoCapProfile(params?.row)) return 'BAJA DIA 1'
  return 'DESERCIÓN'
}

export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '' } = {}) {
  // Si el usuario seleccionó o especificó un motivo explícito en la interfaz, se respeta ese motivo
  if (motivo && String(motivo).trim()) {
    const cleanMotivo = String(motivo).trim()
    if (isBajaDia1Motivo(cleanMotivo)) {
      const day = Number(trainingDayIndex) || 0
      if (day === 1 && !isRecuperadoCapProfile(row)) {
        return 'BAJA DIA 1'
      }
      return 'DESERCIÓN'
    }
    return cleanMotivo
  }

  // Si no se proporcionó un motivo nuevo pero existe uno previo consolidado
  if (previousMotivo && String(previousMotivo).trim()) {
    const cleanPrev = String(previousMotivo).trim()
    if (isBajaDia1Motivo(cleanPrev) && isRecuperadoCapProfile(row)) {
      return 'DESERCIÓN'
    }
    return cleanPrev
  }

  const day = Number(trainingDayIndex) || 0
  if (day === 1 && !isRecuperadoCapProfile(row)) return 'BAJA DIA 1'
  return 'DESERCIÓN'
}

export function countsInFormacionDesercion(row = {}, motivo = '') {
  if (isRecuperadoCapProfile(row)) return false
  if (isBajaDia1Motivo(motivo)) return false
  return true
}
