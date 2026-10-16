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

export function isDistintoAptoProfile(row = {}) {
  if (isRecuperadoCapProfile(row)) return false
  const blob = profileBlob(row)
  if (
    blob.includes('AGREGADO') ||
    blob.includes('RECUPERAD') ||
    blob.includes('OBSERVAD') ||
    blob.includes('CESE') ||
    blob.includes('CESADO') ||
    blob.includes('REUBICAD')
  ) {
    return true
  }
  const tipo = cleanUpper(row.tipo_reclutado || row.tipoReclutado || row.tipo || '')
  if (tipo && tipo !== 'APTO' && tipo !== 'REGULAR') {
    return true
  }
  return false
}

export function canAssignBajaDia1({ trainingDayIndex = 0, row = {}, existingMotivo = '', hadDia1Attendance = false, corte = null, corteIndex = null, hadAttendanceInEarlierCuts = false } = {}) {
  if (isRecuperadoCapProfile(row)) return false

  // Regla Oficial de Calibración Día 1 con 3 Cortes:
  // Reclutamiento hace seguimiento hasta el Corte 2.
  // Si se está en Corte 3, o si el alumno ya tuvo asistencia (A / I-OP) en un corte previo del Día 1:
  // NO se considera Baja Día 1. El formador debe registrar la baja con el motivo específico de formación.
  const currentCorte = Number(corte ?? corteIndex ?? row?.corte ?? row?.corteIndex ?? 0)
  if (currentCorte === 3) return false
  if (hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts) return false

  const day = Number(trainingDayIndex) || 0
  if (day === 1) return true

  // Tiempo de gracia para perfiles distintos a APTO (Agregados, Recuperados, Observados, Cesados, etc.):
  // Si en Día 2 son baja y no tuvieron asistencia en Día 1 (faltaron o no tuvieron registro), se permite BAJA DIA 1
  const hasDia1Att = Boolean(
    hadDia1Attendance ||
    row?.hadDia1Attendance ||
    row?.dia1Asistio ||
    (row?.dia1Sigla === 'A' || row?.dia1Sigla === 'I-OP')
  )

  if (day === 2 && isDistintoAptoProfile(row) && !hasDia1Att) {
    return true
  }

  return false
}

export function defaultBajaMotivo(params = {}) {
  const currentCorte = Number(params?.corte ?? params?.corteIndex ?? params?.row?.corte ?? params?.row?.corteIndex ?? 0)
  const isCorte3 = currentCorte === 3
  const prev = params?.previousMotivo || params?.existingMotivo || params?.row?.pastMotive || params?.row?.motivo_baja || ''

  if (prev && String(prev).trim()) {
    const cleanPrev = String(prev).trim()
    if (isBajaDia1Motivo(cleanPrev) && (isRecuperadoCapProfile(params?.row) || isCorte3)) {
      return 'DESERCIÓN'
    }
    return cleanPrev
  }
  const day = Number(params?.trainingDayIndex) || 0
  const row = params?.row || {}
  const hadDia1Attendance = Boolean(params?.hadDia1Attendance || row?.hadDia1Attendance)
  const hadAttendanceInEarlierCuts = Boolean(params?.hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts)

  if (canAssignBajaDia1({ trainingDayIndex: day, row, hadDia1Attendance, corte: currentCorte, hadAttendanceInEarlierCuts })) {
    return 'BAJA DIA 1'
  }
  return 'DESERCIÓN'
}

export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '', hadDia1Attendance = false, corte = null, corteIndex = null, hadAttendanceInEarlierCuts = false } = {}) {
  const day = Number(trainingDayIndex) || 0
  const currentCorte = Number(corte ?? corteIndex ?? row?.corte ?? row?.corteIndex ?? 0)
  const hasDia1Att = Boolean(hadDia1Attendance || row?.hadDia1Attendance)
  const hasEarlierAtt = Boolean(hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts)
  const isEligible = canAssignBajaDia1({ trainingDayIndex: day, row, hadDia1Attendance: hasDia1Att, corte: currentCorte, hadAttendanceInEarlierCuts: hasEarlierAtt })

  // Si el usuario seleccionó o especificó un motivo explícito en la interfaz, se respeta ese motivo
  if (motivo && String(motivo).trim()) {
    const cleanMotivo = String(motivo).trim()
    if (isBajaDia1Motivo(cleanMotivo)) {
      if (isEligible) {
        return 'BAJA DIA 1'
      }
      return 'DESERCIÓN'
    }
    return cleanMotivo
  }

  // Si no se proporcionó un motivo nuevo pero existe uno previo consolidado
  if (previousMotivo && String(previousMotivo).trim()) {
    const cleanPrev = String(previousMotivo).trim()
    if (isBajaDia1Motivo(cleanPrev)) {
      if (isEligible && !isRecuperadoCapProfile(row)) {
        return cleanPrev
      }
      return 'DESERCIÓN'
    }
    return cleanPrev
  }

  if (isEligible) return 'BAJA DIA 1'
  return 'DESERCIÓN'
}

export function countsInFormacionDesercion(row = {}, motivo = '') {
  if (isRecuperadoCapProfile(row)) return false
  if (isBajaDia1Motivo(motivo)) return false
  return true
}

