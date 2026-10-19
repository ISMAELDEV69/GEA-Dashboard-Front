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

/**
 * No rellena motivo automático: el formador debe elegir de la lista predeterminada.
 * Solo preserva un motivo previo válido; si BAJA DIA 1 no aplica al corte, lo limpia.
 */
export function defaultBajaMotivo(params = {}) {
  const currentCorte = Number(params?.corte ?? params?.corteIndex ?? params?.row?.corte ?? params?.row?.corteIndex ?? 0)
  const prev = params?.previousMotivo || params?.existingMotivo || params?.row?.pastMotive || params?.row?.motivo_baja || ''

  if (prev && String(prev).trim()) {
    return sanitizeBajaDia1Motivo({
      ...params,
      motivo: String(prev).trim(),
      previousMotivo: '',
      corte: currentCorte,
    })
  }
  return ''
}

/**
 * Valida BAJA DIA 1 según corte/asistencia previa.
 * No inventa "DESERCIÓN": si el motivo no aplica, deja vacío para que el formador elija de la lista.
 */
export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '', hadDia1Attendance = false, corte = null, corteIndex = null, hadAttendanceInEarlierCuts = false } = {}) {
  const day = Number(trainingDayIndex) || 0
  const currentCorte = Number(corte ?? corteIndex ?? row?.corte ?? row?.corteIndex ?? 0)
  const hasDia1Att = Boolean(hadDia1Attendance || row?.hadDia1Attendance)
  const hasEarlierAtt = Boolean(hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts)
  const isEligible = canAssignBajaDia1({ trainingDayIndex: day, row, hadDia1Attendance: hasDia1Att, corte: currentCorte, hadAttendanceInEarlierCuts: hasEarlierAtt })

  // Motivo explícito elegido por el formador
  if (motivo && String(motivo).trim()) {
    const cleanMotivo = String(motivo).trim()
    if (isBajaDia1Motivo(cleanMotivo)) {
      if (isEligible) {
        return 'BAJA DIA 1'
      }
      // No aplica en C3 / con A previa: limpiar para forzar elección de motivo de formación
      return ''
    }
    return cleanMotivo
  }

  // Motivo previo consolidado (solo si sigue siendo válido)
  if (previousMotivo && String(previousMotivo).trim()) {
    const cleanPrev = String(previousMotivo).trim()
    if (isBajaDia1Motivo(cleanPrev)) {
      if (isEligible && !isRecuperadoCapProfile(row)) {
        return cleanPrev
      }
      return ''
    }
    return cleanPrev
  }

  // Sin predeterminado: el formador elige de la lista
  return ''
}

export function countsInFormacionDesercion(row = {}, motivo = '') {
  if (isRecuperadoCapProfile(row)) return false
  if (isBajaDia1Motivo(motivo)) return false
  return true
}

/**
 * Analiza registros del Día 1 por cortes (RyS C1–C2 vs Formación C3).
 * - Entrega Formación: hubo A/I-OP en C1/C2, o sigla no-B en el registro del día.
 * - Baja Día 1 RyS: B en C1/C2 sin A previo.
 * - Baja C3 Formación: B en Corte 3 (nunca imputa a RyS; si hubo A en C1/C2, sigue contando entrega).
 */
export function analyzeDia1CorteRecords(d1Records = [], exactRecord = null) {
  const records = Array.isArray(d1Records) ? d1Records : []
  const exact = exactRecord || (records.length > 0 ? records[records.length - 1] : null)

  const normCorte = (raw) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 1 // legacy sin corte = C1
    return n
  }

  const hadAttendanceInEarlierCuts = records.some((r) => {
    const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim()
    const c = normCorte(r.corte ?? r.corteIndex)
    return (s === 'A' || s === 'I-OP') && (c === 1 || c === 2)
  })

  const d1Sigla = exact ? String(exact.sigla_asistencia || exact.sigla || '').toUpperCase().trim() : ''
  const d1Motivo = exact ? String(exact.motivo_baja || '').toUpperCase().trim() : ''
  const corte = exact ? normCorte(exact.corte ?? exact.corteIndex) : 0
  const isCorte3Drop = Boolean(
    exact &&
    d1Sigla === 'B' &&
    (corte === 3 || String(exact.fecha_hora_registro || '').toUpperCase().includes('CORTE 3'))
  )

  const isBajaDia1Rys = Boolean(
    exact &&
    d1Sigla === 'B' &&
    !hadAttendanceInEarlierCuts &&
    !isCorte3Drop &&
    (isBajaDia1Motivo(d1Motivo) || d1Motivo.includes('NO SHOW') || corte === 1 || corte === 2 || !corte)
  )

  // Formación recibió al alumno si hubo presencia en C1/C2, o si el registro del día no es no-show RyS
  const receivedByFormacion = Boolean(
    hadAttendanceInEarlierCuts ||
    (exact && d1Sigla && d1Sigla !== 'B') ||
    (isCorte3Drop && hadAttendanceInEarlierCuts)
  )

  return {
    hadAttendanceInEarlierCuts,
    isCorte3Drop,
    isBajaC3Formacion: isCorte3Drop,
    isBajaDia1Rys,
    receivedByFormacion,
    d1Sigla,
    d1Motivo,
    corte,
  }
}

