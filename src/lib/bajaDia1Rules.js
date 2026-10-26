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
    m.includes('PERIODO GRACIA') ||
    m.includes('NO SHOW') ||
    m.includes('NO_SHOW') ||
    m.includes('NO-SHOW') ||
    m.includes('ABANDONO DIA 1') ||
    m.includes('DESISTIMIENTO DIA 1') ||
    m.includes('NO SE PRESENTO') ||
    m.includes('NO ASISTIO DIA 1')
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

export function canAssignBajaDia1({ trainingDayIndex = 0, row = {}, existingMotivo = '', hadDia1Attendance = false, corte = null, corteIndex = null, hadAttendanceInEarlierCuts = false, hadC2Falta = false } = {}) {
  if (isRecuperadoCapProfile(row)) return false

  // Regla Oficial de Calibración Día 1:
  // Reclutamiento hace seguimiento en Día 1.
  // NUEVA REGLA GEA: Si en Día 1 el postulante estuvo en C1 (A), pero tuvo falta en C2 (FI/FJ o abandono)
  // y en C3 es declarado Baja: SE CLASIFICA COMO 'BAJA DIA 1' (no imputable a Formación).
  const currentCorte = Number(corte ?? corteIndex ?? row?.corte ?? row?.corteIndex ?? 0)
  const day = Number(trainingDayIndex) || 0
  const isC2Falta = Boolean(hadC2Falta || row?.hadC2Falta || row?.c2Falta)

  if (day === 1 && currentCorte === 3 && isC2Falta) {
    return true
  }

  // En C3 sin falta previa en C2 no aplica BAJA DIA 1
  if (currentCorte === 3) return false
  if (hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts) {
    if (day === 1 && isC2Falta) return true
    return false
  }

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

  if (prev && String(prev).trim() && String(prev).trim() !== 'OBSERVADO') {
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
 * No inventa "OBSERVADO" ni "DESERCIÓN": si el motivo no aplica, deja vacío para que el formador elija de la lista.
 */
export function sanitizeBajaDia1Motivo({ trainingDayIndex, row, motivo, previousMotivo = '', hadDia1Attendance = false, corte = null, corteIndex = null, hadAttendanceInEarlierCuts = false, hadC2Falta = false } = {}) {
  const day = Number(trainingDayIndex) || 0
  const currentCorte = Number(corte ?? corteIndex ?? row?.corte ?? row?.corteIndex ?? 0)
  const hasDia1Att = Boolean(hadDia1Attendance || row?.hadDia1Attendance)
  const hasEarlierAtt = Boolean(hadAttendanceInEarlierCuts || row?.hadAttendanceInEarlierCuts)
  const isC2Falta = Boolean(hadC2Falta || row?.hadC2Falta || row?.c2Falta)
  const isEligible = canAssignBajaDia1({ trainingDayIndex: day, row, hadDia1Attendance: hasDia1Att, corte: currentCorte, hadAttendanceInEarlierCuts: hasEarlierAtt, hadC2Falta: isC2Falta })

  // Motivo explícito elegido por el formador
  if (motivo && String(motivo).trim()) {
    const cleanMotivo = String(motivo).trim()
    if (isBajaDia1Motivo(cleanMotivo)) {
      if (isEligible) {
        return 'BAJA DIA 1'
      }
      return ''
    }
    return cleanMotivo
  }

  // Motivo previo consolidado (solo si sigue siendo válido)
  if (previousMotivo && String(previousMotivo).trim() && String(previousMotivo).trim() !== 'OBSERVADO') {
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

  const c1Record = records.find(r => normCorte(r.corte ?? r.corteIndex) === 1)
  const c2Record = records.find(r => normCorte(r.corte ?? r.corteIndex) === 2)
  const c1Att = c1Record && (String(c1Record.sigla_asistencia || c1Record.sigla || '').toUpperCase().trim() === 'A')
  const c2Sigla = c2Record ? String(c2Record.sigla_asistencia || c2Record.sigla || '').toUpperCase().trim() : ''
  const c2Falta = !c2Record || c2Sigla === 'FI' || c2Sigla === 'FJ' || c2Sigla === 'F' || c2Sigla === 'B'
  const isAbandonoDia1C2 = Boolean(c1Att && c2Falta)

  const hadAttendanceInEarlierCuts = records.some((r) => {
    const s = String(r.sigla_asistencia || r.sigla || '').toUpperCase().trim()
    const c = normCorte(r.corte ?? r.corteIndex)
    return (s === 'A' || s === 'I-OP') && (c === 1 || c === 2)
  })

  const d1Sigla = exact ? String(exact.sigla_asistencia || exact.sigla || '').toUpperCase().trim() : ''
  const d1Motivo = exact ? String(exact.motivo_baja || '').toUpperCase().trim() : ''
  const corte = exact ? normCorte(exact.corte ?? exact.corteIndex) : 0
  
  // Si fue abandono con falta en C2, NO es deserción imputable a Formación C3
  const isCorte3Drop = Boolean(
    exact &&
    d1Sigla === 'B' &&
    !isAbandonoDia1C2 &&
    (corte === 3 || String(exact.fecha_hora_registro || '').toUpperCase().includes('CORTE 3'))
  )

  const isBajaDia1Rys = Boolean(
    exact &&
    d1Sigla === 'B' &&
    (!hadAttendanceInEarlierCuts || isAbandonoDia1C2) &&
    !isCorte3Drop &&
    (isBajaDia1Motivo(d1Motivo) || d1Motivo.includes('NO SHOW') || isAbandonoDia1C2 || corte === 1 || corte === 2 || !corte)
  )

  // Formación recibió al alumno si completó presencia continua o no abandonó en C2
  const receivedByFormacion = Boolean(
    (!isAbandonoDia1C2 && hadAttendanceInEarlierCuts) ||
    (exact && d1Sigla && d1Sigla !== 'B') ||
    (isCorte3Drop && hadAttendanceInEarlierCuts)
  )

  return {
    hadAttendanceInEarlierCuts,
    isAbandonoDia1C2,
    isCorte3Drop,
    isBajaC3Formacion: isCorte3Drop,
    isBajaDia1Rys,
    receivedByFormacion,
    d1Sigla,
    d1Motivo,
    corte,
  }
}

