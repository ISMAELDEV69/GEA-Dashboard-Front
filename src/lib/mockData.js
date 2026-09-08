// Base de datos local vacía para modo demo / roleplay desde cero

export const EMPTY_CATALOG = {
  sedes: [],
  reclutadores: [],
  formadores: [],
  campanas: [],
  grupos: [],
  postulantes: [],
  asistencias: [],
  evaluaciones: [],
  audit_logs: [],
  motivos_baja: [
    { motivo: 'BAJA DIA 1', siglas: 'B1', descripcion: 'Deserción el primer día de capacitación' },
    { motivo: 'NO CONTACTO', siglas: 'NC', descripcion: 'No se pudo contactar al postulante' },
    { motivo: 'SOBREDOTACIÓN', siglas: 'SOB', descripcion: 'Baja por sobrecupo o sobredotación del grupo' },
  ],
}

export const initLocalStorageDb = () => {
  const keys = Object.keys(EMPTY_CATALOG)
  for (const key of keys) {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(EMPTY_CATALOG[key]))
    }
  }
}

/** Reinicia localStorage a estado vacío (roleplay) */
export const resetLocalStorageDb = () => {
  for (const [key, val] of Object.entries(EMPTY_CATALOG)) {
    localStorage.setItem(key, JSON.stringify(val))
  }
}

export const getFromStorage = (key) => {
  initLocalStorageDb()
  return JSON.parse(localStorage.getItem(key))
}

export const saveToStorage = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data))
}

export const addAuditLog = (table, operation, recordId, oldVal, newVal, userEmail = 'demo@gea.local') => {
  const logs = getFromStorage('audit_logs')
  const newLog = {
    id: Date.now(),
    tabla_afectada: table,
    operacion: operation,
    id_registro: String(recordId),
    valores_anteriores: oldVal,
    valores_nuevos: newVal,
    usuario_email: userEmail,
    fecha: new Date().toISOString(),
  }
  saveToStorage('audit_logs', [newLog, ...logs])
}
