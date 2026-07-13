import * as XLSX from 'xlsx';
/**
 * dataService.js
 * Capa de abstracción de datos: usa Supabase si está configurado,
 * si no, cae al mock de localStorage automáticamente.
 */

import { supabase } from './supabase'
import { enrichGruposWithStats } from './capacidadRysSync'
import { SHEET_SOURCES, sheetCsvUrl } from './sheetSources.js'
import { parseCsvToMatrix, parseNominaRows } from './nominaConsolidadoSchema.js'
import { asistenciaRecordsFromNominaRow, extractGruposFromRows } from './sheetImportUtils.js'
import { atribuirBaja } from './flujoOperativo.js'
import {
  getFromStorage,
  saveToStorage,
  addAuditLog as mockAuditLog,
  initLocalStorageDb
} from './mockData'

// Detecta si Supabase está realmente configurado
const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return (
    url &&
    key &&
    !url.includes('tu-proyecto') &&
    !url.includes('placeholder') &&
    !key.includes('PEGA_AQUI') &&
    !key.includes('placeholder')
  )
}

export const DB_MODE = isSupabaseConfigured() ? 'supabase' : 'local'

// ─────────────────────────────────────────────
// AUTH & PERFIL
// ─────────────────────────────────────────────

const VALID_ROLES = ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion']

function profileFromSession(sessionUser) {
  const meta = sessionUser?.user_metadata || {}
  const rol = VALID_ROLES.includes(meta.rol) ? meta.rol : 'visor'
  return {
    id: sessionUser.id,
    nombre: meta.nombre || sessionUser.email?.split('@')[0] || 'Usuario',
    rol,
    cargo: meta.cargo || null,
    telefono: meta.telefono || null,
    avatar_url: meta.avatar_url || null,
  }
}

export async function fetchUserProfile(userId, sessionUser = null) {
  if (DB_MODE !== 'supabase') {
    try {
      const stored = JSON.parse(localStorage.getItem('gea-perfil') || '{}')
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin', ...stored }
    } catch {
      return { id: 'demo', nombre: 'Usuario Demo', rol: 'admin' }
    }
  }

  const attachNombreCompleto = async (profile) => {
    if (!profile) return profile;
    try {
      const { data: recData } = await supabase
        .from('equipo_reclutamiento')
        .select('apellido_paterno, apellido_materno, nombres_completos')
        .ilike('alix', profile.nombre)
        .maybeSingle();

      if (recData) {
        const full = `${recData.apellido_paterno || ''} ${recData.apellido_materno || ''} ${recData.nombres_completos || ''}`.trim().replace(/\\s+/g, ' ');
        profile.nombre_completo = full;
        profile.nombre = full;
        return profile;
      }

      const { data: formData } = await supabase
        .from('equipo_formacion')
        .select('apellido_paterno, apellido_materno, nombres_completos')
        .ilike('usuario_alix', profile.nombre)
        .maybeSingle();

      if (formData) {
        const full = `${formData.apellido_paterno || ''} ${formData.apellido_materno || ''} ${formData.nombres_completos || ''}`.trim().replace(/\\s+/g, ' ');
        profile.nombre_completo = full;
        profile.nombre = full;
        return profile;
      }
    } catch(e) {}
    
    profile.nombre_completo = profile.nombre;
    return profile;
  };

  // RPC que crea el perfil si falta (trigger falló o usuario creado manualmente)
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_profile')
  if (!rpcErr && rpcData) return await attachNombreCompleto(rpcData)

  const { data, error } = await supabase
    .from('perfiles')
    .select('codigo, nombre, rol, cargo, telefono, avatar_url, reclutador_id, formador_documento')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (data) return await attachNombreCompleto(data)

  // Perfil ausente: intentar crear desde metadata de la sesión
  if (sessionUser) {
    const bootstrap = profileFromSession(sessionUser)
    const { data: inserted, error: insErr } = await supabase
      .from('perfiles')
      .upsert(bootstrap)
      .select('codigo, nombre, rol, cargo, telefono, avatar_url, reclutador_id, formador_documento')
      .single()
    if (!insErr && inserted) return await attachNombreCompleto(inserted)
    return await attachNombreCompleto(bootstrap)
  }

  return null
}

const normalizeGPE = (val) => String(val || '').replace(/^GPE-?/i, '').trim();
const normalizeCampana = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const normalizeDNI = (d) => String(d || '').trim(); // Don't padStart yet in case CE is alphanumeric

const makeDescuentoKey = (doc, camp, grupo) => {
  return `${normalizeDNI(doc)}|${normalizeCampana(camp)}|${normalizeGPE(grupo)}`;
}

export async function getDescuentosSetGlobal() {
  if (DB_MODE !== 'supabase') return new Set();
  
  let allData = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;
  
  while(hasMore) {
    const { data } = await supabase.from('descuentos')
      .select('dni_ce, campana, grupo_cap, procede, autoriza_rys, autoriza_cap')
      .range(from, from + step - 1);
      
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < step) hasMore = false;
      else from += step;
    } else {
      hasMore = false;
    }
  }
  
  const procedeData = allData.filter(row => {
    // Si la BD tiene explícitamente "PROCEDE"
    if (String(row.procede || '').trim().toUpperCase() === 'PROCEDE') return true;
    
    // Regla de negocio explícita (autoriza_rys = SI y autoriza_cap = SI/Vacio)
    const rys = String(row.autoriza_rys || '').trim().toUpperCase() === 'SI';
    const cap = (String(row.autoriza_cap || '').trim().toUpperCase() === 'SI' || !row.autoriza_cap);
    return rys && cap;
  });
  
  return new Set(procedeData.map(d => makeDescuentoKey(d.dni_ce, d.campana, d.grupo_cap)));
}

async function fetchAllConsolidado() {
  let allData = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;
  while(hasMore) {
    const { data, error } = await supabase.from('consolidado_asistencias').select('*').order('created_at', { ascending: true }).range(from, from + step - 1);
    if(error) throw error;
    if(data && data.length > 0) {
      allData = allData.concat(data);
      if(data.length < step) hasMore = false;
      else from += step;
    } else {
      hasMore = false;
    }
  }
  
  const descSet = await getDescuentosSetGlobal();
  if (descSet.size > 0) {
    allData = allData.filter(row => !descSet.has(makeDescuentoKey(row.documento, row.campana, row.codigo_grupo)));
  }
  
  return allData;
}
export async function getFirstDateFormador(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;
  const { data } = await supabase
    .from('consolidado_asistencias')
    .select('fecha_registro_asistencia')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('fecha_registro_asistencia', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? data.fecha_registro_asistencia : null;
}

export async function getMetricasReporteCalibracion(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;

  const { data: nominas } = await supabase.from('nominas').select('documento, dia_0, dia_1, activo').eq('grupo_codigo', grupo_codigo).eq('campana', campana);
  
  let totalNomina = 0;
  let totalDia0 = 0;
  let countRec = 0;
  
  if (nominas) {
     const descSet = await getDescuentosSetGlobal();
     const validNominas = descSet.size > 0 
       ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
       : nominas;
       
     totalNomina = validNominas.length;
     totalDia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length;
     countRec = validNominas.filter(n => String(n.dia_1).toUpperCase().trim() === 'ASISTIO').length;
  }
  
  const { data: config } = await supabase.from('grupos_dia1').select('estado_calibracion, fecha_dia1').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle();
  let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';
  let fecha_dia1_ref = config?.fecha_dia1 || null;

  if (!fecha_dia1_ref) {
    fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana);
  }
  const counts = await getCalibracionCounts(grupo_codigo, campana, fecha_dia1_ref);
  const countForm = counts.form;

  if (estado_calibracion === 'PENDIENTE' && fecha_dia1_ref) {
    if (countRec !== countForm) {
      estado_calibracion = 'DESCALIBRADO';
    } else if (countRec > 0 || countForm > 0) {
      estado_calibracion = 'CALIBRADO';
    }
  }

  return {
    totalNomina,
    totalDia0,
    totalDia1: countRec,
    totalFormador: countForm,
    estado_calibracion,
    fecha_dia1: fecha_dia1_ref
  }
}

export async function adminResetUserPassword(userId, newPassword) {
  if (DB_MODE !== 'supabase') throw new Error('Solo disponible en Supabase.')
  
  // Try edge function
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: { userId, password: newPassword }
  })
  
  if (error) throw new Error(error.message)
  return data
}

export async function createUserAccount({ email, password, nombre, rol }) {
  if (DB_MODE !== 'supabase') {
    throw new Error('Creación de usuarios disponible solo con Supabase activo.')
  }

  const cleanEmail = email.trim().toLowerCase()
  const safeRol = VALID_ROLES.includes(rol) ? rol : 'visor'
  const displayName = nombre.trim() || cleanEmail.split('@')[0]

  // Método principal: RPC en PostgreSQL (no requiere Edge Function)
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
    p_email: cleanEmail,
    p_password: password,
    p_nombre: displayName,
    p_rol: safeRol,
  })

  if (!rpcError && rpcData) {
    return {
      id: rpcData.id,
      email: rpcData.email || cleanEmail,
      nombre: rpcData.nombre || displayName,
      rol: rpcData.rol || safeRol,
    }
  }

  const rpcMsg = rpcError?.message || ''
  const rpcMissing = rpcMsg.includes('admin_create_user') && (
    rpcMsg.includes('does not exist') || rpcMsg.includes('Could not find')
  )

  if (!rpcMissing) {
    throw new Error(rpcMsg || 'No se pudo crear el usuario')
  }

  // Respaldo: Edge Function (si está desplegada)
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      email: cleanEmail,
      password,
      nombre: displayName,
      rol: safeRol,
    },
  })

  if (error) {
    throw new Error(
      'No se pudo crear el usuario. Ejecuta: npm run db:create-user-rpc'
    )
  }

  if (data?.error) throw new Error(data.error)
  return data?.user
}

export async function updateUserRole(userId, newRole) {
  if (!VALID_ROLES.includes(newRole)) throw new Error('Rol inválido')
  const { error } = await supabase
    .from('perfiles')
    .update({ rol: newRole })
    .eq('id', userId)
  if (error) throw error
}

export async function signOut() {
  if (DB_MODE !== 'supabase') return
  await supabase.auth.signOut()
}

// ─────────────────────────────────────────────
// POSTULANTES / NÓMINAS (schema v2)
// ─────────────────────────────────────────────

async function resolveOrCreateCatalog(table, nameCol, name) {
  if (!name?.trim()) return null
  const clean = name.trim().toUpperCase()
  const { data: existing } = await supabase.from(table).select('codigo').ilike(nameCol, clean).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase.from(table).insert({ [nameCol]: clean }).select('codigo').single()
  if (error) throw error
  return created.id
}

/** Crea o resuelve entrada en catálogo — usable desde formularios antes de guardar nómina */
export async function ensureReclutador(nombre) {
  if (!nombre?.trim()) throw new Error('Ingresa el nombre del reclutador.')
  const clean = nombre.trim().toUpperCase()
  if (DB_MODE === 'supabase') {
    return resolveOrCreateCatalog('reclutadores', 'nombre_completo', clean)
  }
  const list = getFromStorage('reclutadores') || []
  if (!list.some(r => String(r).toUpperCase() === clean)) {
    saveToStorage('reclutadores', [...list, clean])
  }
  return clean
}

export async function ensureSede(nombre) {
  const clean = nombre?.trim().toUpperCase()
  if (!clean) throw new Error('Ingresa la sede.')
  if (DB_MODE === 'supabase') {
    // No-op since sede is a string column
    return clean
  }
  const list = getFromStorage('sedes') || []
  if (!list.includes(clean)) {
    saveToStorage('sedes', [...list, clean])
  }
  return clean
}

export async function ensureCampana(nombre, segmento) {
  const clean = nombre?.trim().toUpperCase()
  if (!clean) throw new Error('Ingresa la campaña.')
  if (DB_MODE === 'supabase') {
    return { nombre: clean, segmento: segmento?.trim().toUpperCase() || '' }
  }
  const list = getFromStorage('campanas') || []
  let found = list.find(c => (c.nombre || c).toUpperCase() === clean)
  if (!found) {
    found = { id: Date.now(), nombre: clean, segmento: segmento || '' }
    saveToStorage('campanas', [...list, found])
  }
  return found
}

export async function ensureFormador(nombre, documento) {
  const nombreClean = nombre?.trim().toUpperCase()
  if (!nombreClean) throw new Error('Ingresa el nombre del capacitador.')
  const docClean = documento?.trim() || `F-${nombreClean.replace(/\s+/g, '').slice(0, 15)}`

  if (DB_MODE === 'supabase') {
    const { data: byDoc } = await supabase
      .from('formadores')
      .select('documento, nombre_completo')
      .eq('documento', docClean)
      .maybeSingle()
    if (byDoc) {
      if (byDoc.nombre_completo?.toUpperCase() !== nombreClean) {
        const { error } = await supabase
          .from('formadores')
          .update({ nombre_completo: nombreClean, estado: 'Activo' })
          .eq('documento', docClean)
        if (error) throw error
      }
      return docClean
    }
    const { data: byName } = await supabase
      .from('formadores')
      .select('documento')
      .ilike('nombre_completo', nombreClean)
      .maybeSingle()
    if (byName) return byName.documento

    const { error } = await supabase.from('formadores').insert({
      documento: docClean,
      nombre_completo: nombreClean,
      estado: 'Activo',
    })
    if (error) throw error
    return docClean
  }

  const list = getFromStorage('formadores') || []
  const idx = list.findIndex(f => f.documento === docClean || f.nombre_completo?.toUpperCase() === nombreClean)
  if (idx >= 0) return list[idx].documento
  list.push({ documento: docClean, nombre_completo: nombreClean, estado: 'Activo' })
  saveToStorage('formadores', list)
  return docClean
}

function buildNominaPayload(payload, ids) {
  return {
    documento: payload.documento,
    tipo_documento: payload.tipo_documento || 'DNI',
    apellido_paterno: payload.apellido_paterno,
    apellido_materno: payload.apellido_materno,
    nombres: payload.nombres,
    celular: payload.celular,
    celular_referencia: payload.celular_referencia || null,
    celular_emergencia: payload.celular_emergencia || null,
    contacto_emergencia: payload.contacto_emergencia || null,
    parentesco: payload.parentesco || null,
    correo: payload.correo,
    genero: payload.genero,
    fecha_nacimiento: payload.fecha_nacimiento,
    estado_civil: payload.estado_civil,
    n_hijos: payload.n_hijos ?? 0,
    nivel_academico: payload.nivel_academico,
    carrera: payload.carrera || null,
    entidad: payload.entidad || null,
    nacionalidad: payload.nacionalidad || 'PERUANA',
    lugar_nacimiento: payload.lugar_nacimiento || null,
    lugar_residencia: payload.lugar_residencia || null,
    distrito_residencia: payload.distrito_residencia || null,
    direccion_domicilio: payload.direccion_domicilio || null,
    periodo_reclutado: payload.periodo_reclutado,
    semana_trabajo: payload.semana_trabajo,
    reclutador_id: ids.reclutador_id,
    sede: payload.sede,
    campana: payload.campana,
    segmento: payload.segmento,
    fuente_oferta: payload.fuente_oferta || null,
    observacion_reclutamiento: payload.observacion || payload.observacion_reclutamiento || null,
    exp_call_center: payload.exp_call_center ?? null,
    exp_tipo_campana: payload.exp_tipo_campana || null,
    exp_tiempo_campana: payload.exp_tiempo_campana || null,
    exp_otra: payload.exp_otra || null,
    exp_tiempo_otra: payload.exp_tiempo_otra || null,
    grupo_codigo: payload.grupo_codigo || null,
    formador_documento: payload.formador_documento || null,
    modalidad: payload.modalidad || null,
    condicion: payload.condicion || null,
    horario_gestion: payload.horario_gestion || payload.rango_horario || null,
    descanso: payload.descanso || null,
    envio_dni: payload.envio_dni || null,
    test_psicologico: payload.test_psicologico || null,
    validacion_pc: payload.validacion_pc || null,
    evaluacion_dia_0: payload.evaluacion_dia_0 || null,
    fecha_inicio_capacitacion: payload.fecha_inicio_capacitacion || null,
    fecha_fin_capacitacion: payload.fecha_fin_capacitacion || null,
    fecha_conexion_ojt: payload.fecha_conexion_ojt || null,
    fecha_conexion_op: payload.fecha_conexion_op || null,
    pago_capacitacion: payload.pago_capacitacion ?? null,
    fecha_inscripcion_curso: payload.fecha_inscripcion_curso || null,
    fecha_ingreso: payload.fecha_ingreso || null,
    tipo_trabajo: payload.tipo_trabajo || null,
    tipo_contratacion: payload.tipo_contratacion || null,
    razon_social: payload.razon_social || null,
    rango_salarial: payload.rango_salarial || null,
    remuneracion: payload.remuneracion ?? null,
    bono_variable: payload.bono_variable ?? null,
    bono_movilidad: payload.bono_movilidad ?? null,
    bono_bienvenida: payload.bono_bienvenida ?? null,
    bono_permanencia: payload.bono_permanencia ?? null,
    bono_asistencia_perfecta: payload.bono_asistencia_perfecta ?? null,
    cargo_contractual: payload.cargo_contractual || null,
    dia_0: payload.dia_0 || null,
    dia_0_obs: payload.dia_0_obs || null,
    status_dia_1: payload.status_dia_1 || null,
    dia_1: payload.dia_1 || null,
    dia_1_obs: payload.dia_1_obs || null,
    doc_cv: payload.doc_cv || null,
    doc_dni_adjunto: payload.doc_dni_adjunto || null,
    doc_certijoven: payload.doc_certijoven || null,
    doc_recibo_servicios: payload.doc_recibo_servicios || null,
    doc_ficha_datos: payload.doc_ficha_datos || null,
    doc_autorizacion: payload.doc_autorizacion || null,
    observacion_estado: payload.observacion_estado || null,
    estado: payload.estado || 'EN_CAPACITACION',
  }
}

export async function fetchPostulantes() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('v_nominas_consolidado')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    
    return (data || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento,
    }))
  }
  initLocalStorageDb()
  return getFromStorage('postulantes') || []
}

export async function insertPostulante(payload) {
  if (DB_MODE === 'supabase') {
    const reclutador_id = await resolveOrCreateCatalog('reclutadores', 'nombre_completo', payload.reclutador)
    await ensureCampana(payload.campana, payload.segmento)

    let formador_documento = payload.formador_documento || null
    if (payload.formador_nombre?.trim()) {
      formador_documento = await ensureFormador(payload.formador_nombre, payload.formador_documento)
    }

    const nominaData = buildNominaPayload(payload, { reclutador_id })
    nominaData.formador_documento = formador_documento

    const { data: nominaId, error: rpcErr } = await supabase.rpc('registrar_nomina', { p_data: nominaData })
    if (rpcErr) throw rpcErr

    const { data, error } = await supabase
      .from('v_nominas_consolidado')
      .select('*')
      .eq('nomina_id', nominaId)
      .single()
    if (error) throw error
    return { ...data, campaign: data.campana, observacion: data.observacion_reclutamiento }
  }
  const list = getFromStorage('postulantes') || []
  const item = { ...payload, id: Date.now() }
  saveToStorage('postulantes', [...list, item])
  mockAuditLog('postulantes', 'INSERT', payload.documento, null, payload)
  return item
}

export async function insertPostulantesBulk(payloads) {
  const cleanPayloads = payloads.filter(p => p.documento && p.documento.trim());
  if (cleanPayloads.length === 0) return { inserted: [], skipped: [], failed: [] };

  const targetGrupo = cleanPayloads[0].grupo_codigo;
  let existingDocs = new Set();
  const results = { inserted: [], skipped: [], failed: [] };
  
  if (DB_MODE === 'supabase') {
    // Ya no verificamos docs activos en este grupo. La BD (registrar_nomina)
    // desactiva nóminas anteriores, permitiendo reasignaciones.
    // Aún así, filtramos los repetidos exactos dentro del mismo payload
    
    // Todas las asistencias a insertar
    const allAsistenciaRecords = [];

    for (const payload of cleanPayloads) {
      if (existingDocs.has(payload.documento)) {
        results.skipped.push(payload.documento);
        continue;
      }
      try {
        const saved = await insertPostulante(payload);
        results.inserted.push(saved);
        existingDocs.add(payload.documento);
        
        // Generar registros de asistencia día 0 / día 1
        const aRecords = asistenciaRecordsFromNominaRow(payload);
        allAsistenciaRecords.push(...aRecords);
        
      } catch (err) {
        console.error('Bulk skip:', payload.documento, err.message);
        results.failed.push({ documento: payload.documento, reason: err.message });
      }
    }

    // Insertar asistencias si hay alguna
    if (allAsistenciaRecords.length > 0) {
      // Agrupar por grupo y fecha
      const groupsMap = new Map();
      allAsistenciaRecords.forEach(r => {
        const key = `${r.grupo_codigo}|${r.fecha_asistencia}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { grupo_codigo: r.grupo_codigo, fecha_asistencia: r.fecha_asistencia, registros: [] });
        groupsMap.get(key).registros.push(r);
      });
      
      for (const group of groupsMap.values()) {
        try {
          await upsertAsistencias({
            grupo_codigo: group.grupo_codigo,
            fecha_asistencia: group.fecha_asistencia,
            records: group.registros
          });
        } catch(e) {
          console.error("Error upserting asistencias for group:", group.grupo_codigo, e);
        }
      }
    }

    try {
      await checkCalibracionDia1(targetGrupo)
    } catch(e) {
      console.error("Error checkCalibracionDia1 from insertPostulantesBulk:", e)
    }

    return results;
  }

  // Local/Demo Mode fallback
  const list = getFromStorage('postulantes') || [];
  if (targetGrupo) {
    list.filter(p => p.grupo_codigo === targetGrupo).forEach(p => existingDocs.add(p.documento));
  }
  for (const payload of cleanPayloads) {
    if (existingDocs.has(payload.documento)) {
      results.skipped.push(payload.documento);
      continue;
    }
    const item = { ...payload, id: Date.now() }
    list.push(item);
    results.inserted.push(item);
    existingDocs.add(payload.documento);
  }
  saveToStorage('postulantes', list)
  return results;
}


export async function updatePostulante(documento, payload) {
  if (DB_MODE === 'supabase') {
    const reclutador_id = payload.reclutador
      ? await resolveOrCreateCatalog('reclutadores', 'nombre_completo', payload.reclutador)
      : undefined
    

    const personFields = {
      tipo_documento: payload.tipo_documento,
      apellido_paterno: payload.apellido_paterno,
      apellido_materno: payload.apellido_materno,
      nombres: payload.nombres,
      celular: payload.celular,
      celular_referencia: payload.celular_referencia,
      correo: payload.correo,
      genero: payload.genero,
      fecha_nacimiento: payload.fecha_nacimiento,
      estado_civil: payload.estado_civil,
      n_hijos: payload.n_hijos,
      nivel_academico: payload.nivel_academico,
      carrera: payload.carrera,
      nacionalidad: payload.nacionalidad,
      lugar_residencia: payload.lugar_residencia,
      distrito_residencia: payload.distrito_residencia,
      direccion_domicilio: payload.direccion_domicilio,
      periodo_reclutado: payload.periodo_reclutado,
      semana_trabajo: payload.semana_trabajo,
      fuente_oferta: payload.fuente_oferta,
      observacion_reclutamiento: payload.observacion || payload.observacion_reclutamiento,
      updated_at: new Date().toISOString(),
    }
    
    // Asignar los IDs de llaves foráneas a personFields (nominas)
    if (reclutador_id !== undefined) personFields.reclutador_id = reclutador_id
    if (payload.sede !== undefined) personFields.sede = payload.sede
    if (payload.campana !== undefined) personFields.campana = payload.campana;
    if (payload.segmento !== undefined) personFields.segmento = payload.segmento;
    
    Object.keys(personFields).forEach(k => personFields[k] === undefined && delete personFields[k])

    const { error: nErr } = await supabase
      .from('nominas')
      .update(personFields)
      .eq('documento', documento)
      .eq('activo', true)
    if (nErr) throw nErr

    const { data, error } = await supabase
      .from('v_nominas_consolidado')
      .select('*')
      .eq('documento', documento)
      .maybeSingle()
    if (error) throw error
    if (data) return { ...data, campaign: data.campana }
    return fetchPostulantes().then(list => list.find(p => p.documento === documento))
  }

  // LocalStorage fallback
  const list = getFromStorage('postulantes') || []
  const idx = list.findIndex(p => p.documento === documento)
  if (idx !== -1) {
    const oldVal = list[idx]
    const newVal = { ...oldVal, ...payload, updated_at: new Date().toISOString() }
    list[idx] = newVal
    saveToStorage('postulantes', list)
    mockAuditLog('postulantes', 'UPDATE', documento, oldVal, newVal)
    return newVal
  }
  throw new Error('Postulante no encontrado en modo local.')
}

// ─────────────────────────────────────────────
// GRUPOS
// ─────────────────────────────────────────────
export async function fetchGrupos(postulantesForStats = null) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('capacidad_rys')
      .select('*')
      .order('fecha_registro', { ascending: false })
    if (error) throw error

    return enrichGruposWithStats(
      data.map(g => ({
        ...g,
        fecha: g.fecha_registro
      })),
      postulantesForStats || []
    )
  }
  initLocalStorageDb()
  return enrichGruposWithStats(getFromStorage('grupos') || [], postulantesForStats || [])
}

/** Vista CAPACIDAD_RYS con conteos (Supabase) */
export async function fetchCapacidadRysOperativo() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('capacidad_rys')
      .select('*')
      .order('periodo', { ascending: false })
    if (error) throw error
    
    return (data || []).map(row => ({
      ...row,
      grupo_capacitacion: row.codigo,
      inconsistencias: [],
      tiene_inconsistencias: false,
    }))
  }
  return fetchGrupos()
}

/** Suscripción realtime a cambios de grupos y nóminas */
export function subscribeOperationalData(onChange) {
  if (DB_MODE !== 'supabase') return () => {}
  const channel = supabase
    .channel('gea-operational-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'capacidad_rys' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nominas' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias_capacitacion' }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}



/** Guarda metadata del grupo (CAPACIDAD_RYS + asistencia) y sincroniza nóminas vinculadas */
export async function saveGrupoCapacitacion({
  codigo,
  campana_nombre,
  segmento,
  semana_trabajo,
  semana_label,
  formador_documento,
  fecha_registro,
  modalidad = 'PRESENCIAL',
  area_traslado,
  condicion,
  estado,
  periodo,
  rango_horario,
  extension_teoria,
  fecha_inicio_ojt,
  extension_ojt,
  fecha_ingreso_op,
  rq_solicitado,
  rq_ftes_solicitado,
  meta_dia_0,
  meta_dia_1,
  periodo_ingreso_op,
  periodo_rys,
}) {
  const cleanCodigo = codigo?.trim().toUpperCase()
  if (!cleanCodigo) throw new Error('El código de grupo es obligatorio.')

  const campanaClean = campana_nombre?.trim().toUpperCase()
  const semana = semana_trabajo ? Number(semana_trabajo) : null

  const grupoRow = {
    codigo: cleanCodigo,
    campana: campanaClean || null,
    segmento: segmento?.trim().toUpperCase() || null,
    formador_documento: formador_documento || null,
    fecha_registro: fecha_registro || new Date().toISOString().split('T')[0],
    semana_trabajo: semana,
    semana_label: semana_label || (semana ? `SEM ${semana}` : null),
    modalidad,
    area_traslado: area_traslado || null,
    condicion: condicion || null,
    estado: estado || 'PLANIFICADO',
    periodo: periodo || null,
    rango_horario: rango_horario || null,
    extension_teoria: extension_teoria || null,
    fecha_inicio_ojt: fecha_inicio_ojt || null,
    extension_ojt: extension_ojt || null,
    fecha_ingreso_op: fecha_ingreso_op || null,
    rq_solicitado: rq_solicitado ?? null,
    rq_ftes_solicitado: rq_ftes_solicitado ?? null,
    meta_dia_0: meta_dia_0 ?? null,
    meta_dia_1: meta_dia_1 ?? null,
    periodo_ingreso_op: periodo_ingreso_op || null,
    periodo_rys: periodo_rys || null,
  }

  if (DB_MODE === 'supabase') {
    const { data: existing } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', cleanCodigo)
      .maybeSingle()

    let hasChanges = false

    if (existing) {
      for (const key of Object.keys(grupoRow)) {
        if (grupoRow[key] === undefined) continue
        const valNew = grupoRow[key] === '' ? null : grupoRow[key]
        const valOld = existing[key] === '' ? null : existing[key]
        if (valNew !== valOld) {
          hasChanges = true
          break
        }
      }

      if (hasChanges) {
        const { error } = await supabase
          .from('capacidad_rys')
          .update(grupoRow)
          .eq('codigo', cleanCodigo)
        if (error) throw error
      }
    } else {
      const { error } = await supabase
        .from('capacidad_rys')
        .insert(grupoRow)
      if (error) throw error
      hasChanges = true
    }

    if (hasChanges) {
      // Sync nominas if needed
      if (!existing || existing.campana !== grupoRow.campana || existing.semana_trabajo !== grupoRow.semana_trabajo) {
        const { error: syncErr } = await supabase
          .from('nominas')
          .update({
            campana: grupoRow.campana,
            segmento: grupoRow.segmento,
            ...(semana ? { semana_trabajo: semana } : {}),
          })
          .eq('grupo_codigo', cleanCodigo)
        if (syncErr) console.warn('Sync nominas grupo:', syncErr.message)
      }
      mockAuditLog('capacidad_rys', existing ? 'UPDATE' : 'INSERT', cleanCodigo, null, grupoRow)
    }

    return {
      ...grupoRow,
      fecha: grupoRow.fecha_registro,
    }
  }

  // Local storage fallback omitted for brevity in this replace snippet
  return grupoRow
}

/** Importa filas CAPACIDAD_RYS (CSV/Excel export) en lote optimizado */
export async function importCapacidadRysBulk(payloads, { onProgress } = {}) {
  const results = { ok: 0, fail: 0, deleted: 0, ignored: 0, total: payloads.length, errors: [] }
  if (!payloads.length) return results
  
  // Filtrar solo los que tienen código y que no sean generados automáticamente por el frontend (S/C-FILA)
  const validPayloads = payloads.filter(p => p.codigo && p.codigo.trim() !== '' && !p.codigo.startsWith('S/C-FILA'))
  results.ignored = payloads.length - validPayloads.length
  
  if (validPayloads.length === 0) return results

  // 1. Omitimos la limpieza inicial aquí, la haremos después de cargar las campañas y obtener los IDs existentes.

  // Si estamos en modo local, usamos el flujo antiguo simplificado
  if (DB_MODE !== 'supabase') {
    for (let i = 0; i < validPayloads.length; i++) {
      try {
        await saveGrupoCapacitacion(validPayloads[i])
        results.ok++
      } catch (err) {
        results.fail++
        results.errors.push({ codigo: validPayloads[i]?.codigo, message: err.message })
      }
      if (i % 50 === 0) onProgress?.(i + 1, validPayloads.length)
    }
    return results
  }

  // 2. Borrar todos los registros actuales
  try {
    const { error: errDel } = await supabase.from('capacidad_rys').delete().neq('codigo', 'xxxx_impossible_xxxx')
    if (errDel) throw errDel

    results.deleted = 0 // Optional: count existing before deleting si lo necesitas, pero no es crítico

    // 3. Preparar filas para inserción masiva en capacidad_rys
    const rowsToUpsert = validPayloads.map(p => {
      const campana = (p.campana_nombre || 'SIN CAMPAÑA').toUpperCase()
      const codigo = p.codigo || null
      
      return {
        codigo,
        campana,
        semana_trabajo: p.semana_trabajo === '' ? null : (p.semana_trabajo || null),
        semana_label: p.semana_label || null,
        modalidad: p.modalidad || 'PRESENCIAL',
        condicion: p.condicion || null,
        rango_horario: p.rango_horario || null,
        fecha_registro: p.fecha_registro || new Date().toISOString().split('T')[0],
        periodo: p.periodo || null,
        fecha_inicio_ojt: p.fecha_inicio_ojt || null,
        fecha_ingreso_op: p.fecha_ingreso_op || null,
        extension_teoria: p.extension_teoria === '' ? null : (p.extension_teoria || null),
        extension_ojt: p.extension_ojt === '' ? null : (p.extension_ojt || null),
        rq_solicitado: p.rq_solicitado === '' ? null : p.rq_solicitado,
        rq_ftes_solicitado: p.rq_ftes_solicitado === '' ? null : p.rq_ftes_solicitado,
        meta_dia_0: p.meta_dia_0 === '' ? null : p.meta_dia_0,
        meta_dia_1: p.meta_dia_1 === '' ? null : p.meta_dia_1,
        periodo_ingreso_op: p.periodo_ingreso_op || null,
        periodo_rys: p.periodo_rys || null,
        area_traslado: p.area_traslado || null,
        segmento: p.segmento || null,
        estado: p.estado || 'PLANIFICADO',
      }
    })

    
    // 3.5 Deduplicar filas por código antes de enviar a Supabase
    // (Si en el Excel hay dos filas con el mismo GPE-123, nos quedamos con la última para evitar error de Supabase "cannot affect row a second time")
    const uniqueRowsMap = new Map()
    for (const r of rowsToUpsert) {
      if (r.codigo) {
        uniqueRowsMap.set(r.campana + '_' + r.codigo, r)
      }
    }
    const finalRowsToUpsert = Array.from(uniqueRowsMap.values())

    // 4. Inserción masiva
    const BATCH_SIZE = 500
    for (let i = 0; i < finalRowsToUpsert.length; i += BATCH_SIZE) {
      const batch = finalRowsToUpsert.slice(i, i + BATCH_SIZE)

      const { error } = await supabase.from('capacidad_rys').upsert(batch, { onConflict: 'campana,codigo' })
      
      if (error) {
        results.fail += batch.length
        results.errors.push({ message: error.message })
      } else {
        results.ok += batch.length
      }
      onProgress?.(Math.min(i + BATCH_SIZE, finalRowsToUpsert.length), finalRowsToUpsert.length)
    }
  } catch (err) {
    console.error('Bulk upload error:', err)
    results.fail = validPayloads.length
    results.errors.push({ message: err.message })
  }

  return results
}

/**
 * Sincroniza la hoja CAPACIDAD_RYS desde Google Drive.
 * Descarga el sheet como CSV y lo importa en lote.
 */
const CAPACIDAD_RYS_SHEET_ID = '2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70'
const CAPACIDAD_RYS_GID = '0'

export async function syncCapacidadRysFromDrive({ onProgress } = {}) {
  // Import statically via top-level (already imported in this module's consumers)
  const { parseCapacidadRysCsv } = await import(/* @vite-ignore */ './capacidadRysSchema.js')

  onProgress?.({ phase: 'download', message: 'Descargando hoja de Google Drive…' })

  // Use the published Google Sheets CSV URL
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${CAPACIDAD_RYS_SHEET_ID}/pub?output=csv`

  let csvText
  try {
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csvText = await res.text()
  } catch (err) {
    throw new Error(`No se pudo descargar la hoja de Drive. Asegúrate de que esté compartida como "Cualquier persona con el enlace".`)
  }

  onProgress?.({ phase: 'parse', message: 'Procesando filas…' })
  const payloads = parseCapacidadRysCsv(csvText)
  if (!payloads.length) throw new Error('No se encontraron filas válidas en la hoja de Google Drive.')

  onProgress?.({ phase: 'import', message: `Importando ${payloads.length} grupos…`, total: payloads.length, current: 0 })

  const results = await importCapacidadRysBulk(payloads, {
    onProgress: (cur, tot) => onProgress?.({ phase: 'import', message: `Importando grupo ${cur}/${tot}…`, total: tot, current: cur }),
  })

  onProgress?.({ phase: 'done', message: 'Sincronización completada' })
  return results
}

/**
 * Sincroniza nómina y asistencia desde Google Sheets publicados (desde el navegador).
 * @param {{ sourceIds?: string[], onProgress?: (ev: object) => void }} opts
 */
export async function syncGoogleSheets({ sourceIds = null, onProgress } = {}) {
  const sources = sourceIds?.length
    ? sourceIds.map(id => SHEET_SOURCES[id]).filter(Boolean)
    : Object.values(SHEET_SOURCES)

  if (!sources.length) throw new Error('No hay fuentes de hojas configuradas.')

  const result = { nominas: 0, asistencias: 0, grupos: 0, skipped: 0, errors: [] }

  for (const source of sources) {
    onProgress?.({ phase: 'download', sourceId: source.id, label: source.label, message: 'Descargando CSV…' })

    const res = await fetch(sheetCsvUrl(source))
    if (!res.ok) throw new Error(`No se pudo descargar "${source.label}" (${res.status})`)

    const matrix = parseCsvToMatrix(await res.text())
    const rows = parseNominaRows(matrix, source.defaults)
    if (!rows.length) continue

    onProgress?.({ phase: 'grupos', sourceId: source.id, label: source.label, total: rows.length, current: 0, message: 'Preparando grupos…' })

    const grupos = extractGruposFromRows(rows)
    const existingGrupos = new Set()
    if (DB_MODE === 'supabase' && grupos.length) {
      const codes = grupos.map(g => g.codigo)
      const { data } = await supabase.from('capacidad_rys').select('codigo').in('codigo', codes)
      data?.forEach(g => existingGrupos.add(g.codigo))
    }

    for (const g of grupos) {
      if (existingGrupos.has(g.codigo)) continue
      try {
        await saveGrupoCapacitacion({
          codigo: g.codigo,
          campana_nombre: g.campana_nombre,
          segmento: g.segmento,
          semana_trabajo: g.semana_trabajo,
          semana_label: g.semana_label,
          modalidad: g.modalidad,
          condicion: g.condicion,
          rango_horario: g.rango_horario,
          fecha_registro: g.fecha_registro,
          periodo: g.periodo,
          fecha_inicio_ojt: g.fecha_inicio_ojt,
          fecha_ingreso_op: g.fecha_ingreso_op,
          estado: 'ACTIVO',
        })
        result.grupos++
      } catch (err) {
        result.errors.push({ ref: g.codigo, message: err.message })
      }
    }

    const seen = new Set()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      onProgress?.({
        phase: 'nominas',
        sourceId: source.id,
        label: source.label,
        total: rows.length,
        current: i + 1,
        message: `Importando ${row.documento}…`,
      })

      if (seen.has(row.documento)) {
        result.skipped++
        continue
      }
      seen.add(row.documento)

      try {
        await insertPostulante(row)
        result.nominas++

        if (source.importAsistencia) {
          const records = asistenciaRecordsFromNominaRow(row)
          const batches = new Map()
          for (const rec of records) {
            const key = `${rec.grupo_codigo}|${rec.fecha_asistencia}`
            if (!batches.has(key)) batches.set(key, [])
            batches.get(key).push({
              documento: rec.documento,
              sigla: rec.sigla,
              motivo_baja: rec.motivo_baja,
            })
          }
          for (const [key, recs] of batches) {
            const [grupo_codigo, fecha_asistencia] = key.split('|')
            await upsertAsistencias({ grupo_codigo, fecha_asistencia, records: recs })
            result.asistencias += recs.length
          }
        }
      } catch (err) {
        result.errors.push({ ref: row.documento, message: err.message })
      }
    }
  }

  onProgress?.({ phase: 'done', message: 'Sincronización completada' })
  return result
}

export async function saveAsistenciaSession({ grupoMeta, grupo_codigo, fecha_asistencia, records }) {
  const codigoFinal = grupoMeta?.codigo?.trim().toUpperCase() || grupo_codigo
  const campanaFinal = grupoMeta?.campana_nombre || grupoMeta?.campana || ''
  if (!codigoFinal || !fecha_asistencia) return false
  
  await upsertAsistencias({ grupo_codigo: codigoFinal, grupoMeta, fecha_asistencia, records })
  
  try {
     await checkCalibracionDia1(codigoFinal, campanaFinal)
  } catch(e) {
     console.error("Error checkCalibracionDia1 from saveAsistenciaSession:", e)
  }
  
  return true
}

// ─────────────────────────────────────────────
// ASISTENCIAS
// ─────────────────────────────────────────────
export async function fetchAsistencias() {
  if (DB_MODE === 'supabase') {
    const data = await fetchAllConsolidado();

    // Map consolidado_asistencias back to standard asistencias structure
    // We only keep the latest record per document+date
    const map = new Map();
    data.forEach(row => {
      let isoDate = '';
      if (row.fecha_registro_asistencia) {
        const parts = row.fecha_registro_asistencia.split('/');
        if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      
      if (isoDate) {
        const key = `${row.documento}_${isoDate}`;
        map.set(key, {
          postulante_documento: row.documento,
          grupo_codigo: row.codigo_grupo,
          fecha_asistencia: isoDate,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.fecha_asistencia.localeCompare(a.fecha_asistencia));
  }
  initLocalStorageDb()
  return getFromStorage('asistencias') || []
}

export async function upsertAsistencias({ grupo_codigo, grupoMeta, fecha_asistencia, records }) {
  if (DB_MODE === 'supabase') {
    grupo_codigo = grupo_codigo || grupoMeta?.codigo;
    
    // First, delete existing records for this group and date
    const { error: delErr } = await supabase
      .from('asistencias_capacitacion')
      .delete()
      .eq('grupo_codigo', grupo_codigo)
      .eq('fecha_asistencia', fecha_asistencia)

    // Solo actualizamos 'nominas' si hay bajas (CESADO).
    for (const r of records.filter(x => x.sigla === 'B' && x.documento)) {
      const atrib = atribuirBaja(r.motivo_baja)
      await supabase
        .from('nominas')
        .update({
          estado: 'BAJA',
          observacion_estado: `${r.motivo_baja || 'BAJA'} [${atrib}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('postulante_documento', r.documento)
        .eq('activo', true)
    }

    // Restaurar a ACTIVO si ya no es 'B' (Reactiva a los que vuelven a asistir)
    for (const r of records.filter(x => x.sigla !== 'B' && x.documento)) {
      await supabase
        .from('nominas')
        .update({
          estado: 'ACTIVO',
          observacion_estado: null,
          updated_at: new Date().toISOString(),
        })
        .eq('postulante_documento', r.documento)
        .eq('activo', true)
        .eq('estado', 'BAJA')
    }

    return true
  }

  // LocalStorage fallback
  const existing = getFromStorage('asistencias') || []
    const newRecords = records.map(r => ({
      nomina_id: r.nomina_id,
      postulante_documento: r.documento,
      grupo_codigo,
      fecha_asistencia,
      estado_asistencia: r.estado_asistencia || 'PRESENTE',
      motivo_baja: r.motivo_baja || null
    }))
  const filtered = existing.filter(
    a => !(a.grupo_codigo === grupo_codigo && a.fecha_asistencia === fecha_asistencia)
  )
  const updated = [...filtered, ...newRecords]
  saveToStorage('asistencias', updated)
  mockAuditLog('asistencias_capacitacion', 'INSERT', grupo_codigo, null, { records: newRecords.length })
  return newRecords
}

// ─────────────────────────────────────────────
// RECLUTADORES / SEDES / CAMPANAS
// ─────────────────────────────────────────────
export async function fetchReclutadores() {
  if (DB_MODE === 'supabase') {
    const [recRes, perfRes] = await Promise.all([
      supabase
        .from('equipo_reclutamiento')
        .select('apellido_paterno, apellido_materno, nombres_completos')
        .eq('estado', 'ACTIVO'),
      supabase
        .from('perfiles')
        .select('nombre')
        .eq('rol', 'reclutador')
        .order('nombre'),
    ])
    if (recRes.error) throw recRes.error
    if (perfRes.error) throw perfRes.error

    const names = new Set()
    for (const r of recRes.data || []) {
      const full = `${r.apellido_paterno || ''} ${r.apellido_materno || ''} ${r.nombres_completos || ''}`.trim().replace(/\\s+/g, ' ')
      if (full) names.add(full.toUpperCase())
    }
    for (const p of perfRes.data || []) {
      if (p.nombre?.trim()) names.add(p.nombre.trim().toUpperCase())
    }
    return [...names].sort()
  }
  return getFromStorage('reclutadores') || []
}

export async function fetchSedes() {
  if (DB_MODE === 'supabase') {
    const { data } = await supabase.from('nominas').select('sede').not('sede', 'is', null)
    const unique = [...new Set((data || []).map(d => d.sede))]
    return unique.sort()
  }
  return getFromStorage('sedes') || []
}

export async function fetchCampanas() {
  if (DB_MODE === 'supabase') {
    const { data } = await supabase.from('capacidad_rys').select('campana, segmento').not('campana', 'is', null)
    
    // De-duplicate
    const map = new Map()
    for (const d of (data || [])) {
      if (!map.has(d.campana)) {
        map.set(d.campana, d)
      }
    }
    const unique = Array.from(map.values())
    return unique.sort((a,b) => a.campana.localeCompare(b.campana)).map(c => ({ nombre: c.campana, segmento: c.segmento }))
  }
  return getFromStorage('campanas') || []
}


export async function fetchReclutadoresFull() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('reclutadores')
      .select('id, nombre_completo, activo')
      .order('nombre_completo')
    if (error) throw error
    return data
  }
  // Local fallback
  const list = getFromStorage('reclutadores') || []
  return list.map((nombre, index) => ({
    id: index + 1,
    nombre_completo: nombre,
    activo: true
  }))
}

export async function fetchGruposConMetas() {
  if (DB_MODE === 'supabase') {
    // 1. Fetch groups and recruiters in parallel
    const [gruposRes, relRes, nominasRes] = await Promise.all([
      supabase
        .from('capacidad_rys')
        .select('codigo, periodo, semana_label, estado, meta_dia_0, meta_dia_1, rq_solicitado, campana, segmento, modalidad, rango_horario, fecha_registro, fecha_ingreso_op')
        .order('codigo'),
      supabase
        .from('grupo_reclutadores')
        .select('grupo_codigo, reclutador_id, meta_rq_individual, meta_dia_1_individual, reclutadores(nombre_completo)'),
      supabase
        .from('v_nominas_consolidado')
        .select('grupo_codigo, campana, reclutador_id, dia_0, dia_1, sede')
    ])

    if (gruposRes.error) throw gruposRes.error
    if (relRes.error) throw relRes.error
    if (nominasRes.error) throw nominasRes.error

    const relMap = {}
    for (const r of (relRes.data || [])) {
      if (!relMap[r.grupo_codigo]) relMap[r.grupo_codigo] = []
      relMap[r.grupo_codigo].push({
        reclutador_id: r.reclutador_id,
        nombre_completo: r.reclutadores?.nombre_completo || 'Desconocido',
        meta_rq_individual: r.meta_rq_individual || 0,
        meta_dia_1_individual: r.meta_dia_1_individual || 0
      })
    }

    const nominas = nominasRes.data || []

    return (gruposRes.data || []).map(g => {
      const gCodigo = g.codigo || ''
      const gCampana = g.campana || ''
      const reclutadoresAsignados = relMap[gCodigo] || []
      
      // Filter nominas for this specific group + campaign
      const nominasGrupo = nominas.filter(n => n.grupo_codigo === gCodigo && n.campana === gCampana)

      // Get most frequent sede
      let sede = '-'
      if (nominasGrupo.length > 0) {
        const sedeCounts = {}
        let maxCount = 0
        nominasGrupo.forEach(n => {
          if (n.sede) {
            sedeCounts[n.sede] = (sedeCounts[n.sede] || 0) + 1
            if (sedeCounts[n.sede] > maxCount) {
              maxCount = sedeCounts[n.sede]
              sede = n.sede
            }
          }
        })
      }

      // Group totals
      const listaActual = nominasGrupo.length
      const conectadosDia0 = nominasGrupo.filter(n => n.dia_0 === 'ASISTIO').length
      const conectadosDia1 = nominasGrupo.filter(n => n.dia_1 === 'ASISTIO').length

      // Map over recruiters to add their individual counts
      const reclutadoresConStats = reclutadoresAsignados.map(r => {
        const nominasReclutador = nominasGrupo.filter(n => n.reclutador_id === r.reclutador_id)
        return {
          ...r,
          conteo_individual: nominasReclutador.length,
          conectados_dia_1_individual: nominasReclutador.filter(n => n.dia_1 === 'ASISTIO').length
        }
      })

      return {
        grupo_codigo: gCodigo,
        periodo: g.periodo || '',
        campana_nombre: gCampana || 'Sin Campaña',
        segmento: g.segmento || '',
        supervisor: '',
        estado: g.estado || '',
        semana: g.semana_label || '',
        modalidad: g.modalidad || '',
        horario: g.rango_horario || '',
        fecha_inicio: g.fecha_registro || '',
        fecha_ingreso_op: g.fecha_ingreso_op || '',
        meta_dia_0_grupal: g.meta_dia_0 || 0,
        meta_dia_1_grupal: g.meta_dia_1 || 0,
        rq_solicitado: g.rq_solicitado || 0,
        reclutadores_metas: reclutadoresConStats,
        sede,
        lista_actual: listaActual,
        conectados_dia_0: conectadosDia0,
        conectados_dia_1_grupal: conectadosDia1
      }
    })
  }

  // Local fallback
  return []
}

export async function saveGrupoMetas(grupoCodigo, reclutadoresMetas) {
  if (DB_MODE === 'supabase') {
    if (!grupoCodigo) return false
    const grupo_codigo = grupoCodigo
    
    // 1. Delete existing assignments
    const { error: delErr } = await supabase
      .from('grupo_reclutadores')
      .delete()
      .eq('grupo_codigo', grupo_codigo)
    if (delErr) throw delErr

    // 2. Insert new assignments if any
    if (reclutadoresMetas && reclutadoresMetas.length > 0) {
      const rows = reclutadoresMetas.map(rm => ({
        grupo_codigo: grupo_codigo,
        reclutador_id: rm.reclutador_id,
        meta_rq_individual: rm.meta_rq_individual || 0,
        meta_dia_1_individual: rm.meta_dia_1_individual || 0
      }))
      const { error: insErr } = await supabase
        .from('grupo_reclutadores')
        .insert(rows)
      if (insErr) throw insErr
    }
    return true
  }
  return true
}

export async function fetchFormadores() {
  if (DB_MODE === 'supabase') {
    const [formRes, perfRes] = await Promise.all([
      supabase
        .from('equipo_formacion')
        .select('documento, datos_completos, nombres_completos, estado')
        .eq('estado', 'ACTIVO')
        .order('nombres_completos'),
      supabase
        .from('perfiles')
        .select('nombre')
        .eq('rol', 'formador')
        .order('nombre'),
    ])
    if (formRes.error) throw formRes.error
    if (perfRes.error) throw perfRes.error

    const map = new Map()
    for (const f of formRes.data || []) {
      const nombreFinal = f.datos_completos || f.nombres_completos || ''
      map.set(f.documento || nombreFinal, {
        documento: f.documento,
        nombre_completo: nombreFinal,
        estado: 'ACTIVO'
      })
    }
    for (const p of perfRes.data || []) {
      const doc = `USR-${(p.nombre || 'FORMADOR').replace(/\s+/g, '').slice(0, 12).toUpperCase()}`
      if (!map.has(doc)) {
        map.set(doc, { documento: doc, nombre_completo: p.nombre, estado: 'Activo' })
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.nombre_completo || '').localeCompare(b.nombre_completo || '')
    )
  }
  // Local fallback
  const list = getFromStorage('formadores') || []
  return list.map(f => ({
    documento: f.documento,
    nombre_completo: f.nombre_completo || f.nombre,
    sede: f.sede || '',
    segmento: f.segmento || '',
    subcampana: f.subcampana || '',
    estado: f.estado || 'Activo'
  }))
}

// ─────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────
export async function fetchAuditLogs() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(200)
    if (error) throw error
    return data
  }
  return getFromStorage('audit_logs') || []
}

// ─────────────────────────────────────────────
// EVALUACIONES
// ─────────────────────────────────────────────
export async function fetchEvaluaciones(grupoCodigo) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('evaluaciones_capacitacion')
      .select('*')
      .eq('grupo_codigo', grupoCodigo)
    if (error) throw error
    return data
  }
  initLocalStorageDb()
  const list = getFromStorage('evaluaciones') || []
  return list.filter(e => e.grupo_codigo === grupoCodigo)
}

export async function upsertEvaluaciones(records) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('evaluaciones_capacitacion')
      .upsert(records, { onConflict: 'postulante_documento' })
      .select()
    if (error) throw error
    return data
  }
  initLocalStorageDb()
  const list = getFromStorage('evaluaciones') || []
  const updatedList = [...list]
  
  for (const r of records) {
    const idx = updatedList.findIndex(e => e.postulante_documento === r.postulante_documento)
    const item = { ...r, updated_at: new Date().toISOString() }
    if (idx !== -1) {
      updatedList[idx] = { ...updatedList[idx], ...item }
    } else {
      updatedList.push({ ...item, id: Date.now() + Math.random(), created_at: new Date().toISOString() })
    }
    mockAuditLog('evaluaciones_capacitacion', 'UPSERT', r.postulante_documento, null, r)
  }
  
  saveToStorage('evaluaciones', updatedList)
  return records
}

// ─────────────────────────────────────────────
// MOTIVOS DE BAJA
// ─────────────────────────────────────────────
export async function fetchMotivosBaja() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').select('*')
    if (error) throw error
    return data || []
  }
  initLocalStorageDb()
  return getFromStorage('motivos_baja') || []
}

export async function insertMotivoBaja(payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').insert([payload]).select().single()
    if (error) throw error
    return data
  }
  const list = getFromStorage('motivos_baja') || []
  const item = { ...payload }
  saveToStorage('motivos_baja', [...list, item])
  return item
}

export async function updateMotivoBaja(motivoId, payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').update(payload).eq('motivo', motivoId).select().single()
    if (error) throw error
    return data
  }
  const list = getFromStorage('motivos_baja') || []
  const idx = list.findIndex(m => m.motivo === motivoId)
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...payload }
    saveToStorage('motivos_baja', list)
    return list[idx]
  }
  throw new Error('Motivo de baja no encontrado')
}

export async function deleteMotivoBaja(motivoId) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase.from('motivos_baja').delete().eq('motivo', motivoId)
    if (error) throw error
    return true
  }
  const list = getFromStorage('motivos_baja') || []
  saveToStorage('motivos_baja', list.filter(m => m.motivo !== motivoId))
  return true
}

export async function insertConsolidado(payloads) {
  if (DB_MODE !== 'supabase') return;
  const { error } = await supabase
    .from('consolidado_asistencias')
    .insert(payloads);
  if (error) {
    console.error('Error insertando en consolidado_asistencias:', error);
    alert('Error guardando en base de datos: ' + error.message);
  }
}

export async function fetchConsolidado() {
  if (DB_MODE === 'supabase') {
    const data = await fetchAllConsolidado();
    return data || []
  }
  return []
}

export async function fetchDashboardData() {
  if (DB_MODE === 'supabase') {
    const [consData, capRes, descRes] = await Promise.all([
      fetchAllConsolidado(),
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, fecha_inicio_ojt, periodo, segmento'),
      supabase.from('descuentos').select('dni_ce, campana, grupo_cap')
    ])
    if (capRes.error) throw capRes.error
    if (descRes.error) throw descRes.error
    
    return {
      consolidado: consData || [],
      capacidades: capRes.data || [],
      descuentos: descRes.data || []
    }
  }
  return { consolidado: [], capacidades: [], descuentos: [] }
}

export async function fetchAsistenciaPorRango(startDate, endDate) {
  if (DB_MODE !== 'supabase') return []
  const { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .gte('fecha_asistencia', startDate)
    .lte('fecha_asistencia', endDate)
  if (error) throw error
  return data || []
}

export async function fetchAllAsistenciasBajas() {
  if (DB_MODE !== 'supabase') return []
  
  let allData = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;
  
  while(hasMore) {
    const { data, error } = await supabase
      .from('consolidado_asistencias')
      .select('documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres')
      .eq('sigla', 'B')
      .range(from, from + step - 1);
      
    if (error) throw error;
    
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < step) hasMore = false;
      else from += step;
    } else {
      hasMore = false;
    }
  }
  
  return allData;
}

// ─────────────────────────────────────────────
// REGISTRO Y CALIBRACIÓN DÍA 1
// ─────────────────────────────────────────────

export async function fetchGruposDia1() {
  if (DB_MODE !== 'supabase') return []
  // We need the codigo, so we join with grupos_capacitacion
  const { data, error } = await supabase
    .from('grupos_dia1')
    .select(`
      fecha_dia1,
      estado_calibracion,
      created_at,
      updated_at,
      grupo_codigo,
      capacidad_rys (
        codigo
      )
    `)
  if (error) throw error
  
  return data.map(row => ({
    ...row,
    grupo_codigo: row.capacidad_rys?.codigo
  })) || []
}

export async function upsertGrupoDia1(grupo_codigo, campana, fecha_dia1) {
  if (DB_MODE !== 'supabase') return
  
  // Resolve grupo_id
  
  const { data: existing } = await supabase.from('grupos_dia1').select('grupo_codigo').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle()
  
  if (existing) {
    const { error } = await supabase.from('grupos_dia1').update({
      fecha_dia1,
      estado_calibracion: 'PENDIENTE',
      updated_at: new Date().toISOString()
    }).eq('grupo_codigo', grupo_codigo).eq('campana', campana)
    if (error) throw error
  } else {
    const { error } = await supabase.from('grupos_dia1').insert({
      grupo_codigo,
      campana,
      fecha_dia1,
      estado_calibracion: 'PENDIENTE',
      updated_at: new Date().toISOString()
    })
    if (error) throw error
  }
}

export async function fetchAsistenciasReclutador(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return []
  
  const { data, error } = await supabase
    .from('asistencias_dia1_reclutador')
    .select('*')
    .eq('grupo_codigo', grupo_codigo)
    .eq('campana', campana)
  if (error) throw error
  
  // El usuario solicitó explícitamente que "EN LA NÓMINA DE RECLUTAMIENTO SÍ DEBE MOSTRAR TODO TAL CUAL"
  // Por lo tanto, no filtramos los descuentos aquí.
  return data || []
}

export async function saveAsistenciasReclutador(grupo_codigo, campana, registros) {
  if (DB_MODE !== 'supabase') return
  
  // upsert registros
  const bajas = []
  const payload = registros.map(r => {
    const isBaja = r.sigla_inicial === 'F' || r.sigla_final === 'F'
    if (isBaja) bajas.push(r.documento)
    return {
      postulante_documento: r.documento,
      grupo_codigo,
      campana,
      sigla_inicial: r.sigla_inicial,
      sigla_final: r.sigla_final,
      motivo_baja: isBaja ? 'BAJA DIA 1' : null
    }
  })
  
  const { error: delErr } = await supabase.from('asistencias_dia1_reclutador').delete().eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  if (delErr) throw delErr

  const { error } = await supabase.from('asistencias_dia1_reclutador').insert(payload)
  if (error) throw error

  // Actualizar estado en nóminas si hubo bajas
  if (bajas.length > 0) {
    await supabase.from('nominas')
      .update({ estado: 'CESADO', activo: false })
      .in('postulante_documento', bajas)
  }
  
  // Llamar a check calibracion
  try {
    return await checkCalibracionDia1(grupo_codigo, campana)
  } catch(e) {
    console.error('Error al calibrar:', e)
  }
}

export async function checkCalibracionDia1(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return

  const fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana)
  
  const { data: recAsis } = await supabase.from('nominas').select('documento, dia_1').eq('grupo_codigo', grupo_codigo).eq('campana', campana)

  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = ''
    if (row.fecha_registro_asistencia) {
      const parts = row.fecha_registro_asistencia.split('/')
      if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else {
      const existing = mapFormFull.get(doc)
      if (f.motivo_baja === 'BAJA DIA 1') {
        mapFormFull.set(doc, f)
      } else if (existing.motivo_baja !== 'BAJA DIA 1' && f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      } else if (f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      }
    }
  }

  if (!recAsis || recAsis.length === 0 || mapFormFull.size === 0 || !fecha_dia1_ref) {
    await supabase.from('grupos_dia1').upsert({ grupo_codigo, campana, estado_calibracion: 'PENDIENTE', updated_at: new Date().toISOString() }, { onConflict: 'campana,grupo_codigo' })
    return 'PENDIENTE'
  }

  const mapRec = new Map(recAsis.map(r => [r.documento, r.dia_1]))
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  
  let isCalibrated = true
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc) // 'ASISTIO' or 'FALTA'
    
    // Si no está en nómina, no se cuenta
    if (!recSigla) continue;

    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    
    // Formador asistencia = A, FI, FJ
    const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP'
    const isRecAsistencia = String(recSigla).toUpperCase().trim() === 'ASISTIO'
    
    if (isFormAsistencia !== isRecAsistencia) {
      isCalibrated = false
      break
    }
  }
  
  const newState = isCalibrated ? 'CALIBRADO' : 'DESCALIBRADO'
  await supabase.from('grupos_dia1').upsert({ grupo_codigo, campana, estado_calibracion: newState, updated_at: new Date().toISOString() }, { onConflict: 'campana,grupo_codigo' })
  return newState
}

export async function getCalibracionCounts(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return { rec: 0, form: 0 }
  
  const fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana)
  const { data: rawRecAsis } = await supabase.from('nominas').select('documento, dia_1').eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  
  const descSet = await getDescuentosSetGlobal();
  const recAsis = descSet.size > 0
    ? (rawRecAsis || []).filter(r => !descSet.has(makeDescuentoKey(r.documento, campana, grupo_codigo)))
    : (rawRecAsis || []);

  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = ''
    if (row.fecha_registro_asistencia) {
      const parts = row.fecha_registro_asistencia.split('/')
      if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else {
      const existing = mapFormFull.get(doc)
      if (f.motivo_baja === 'BAJA DIA 1') {
        mapFormFull.set(doc, f)
      } else if (existing.motivo_baja !== 'BAJA DIA 1' && f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      } else if (f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      }
    }
  }


  if (!recAsis) return { rec: 0, form: 0 }

  const mapRec = new Map(recAsis.map(r => [r.documento, r.dia_1]))
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  
  let countRec = 0
  let countForm = 0
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc)
    
    if (!recSigla) continue;

    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    
    const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP'
    const isRecAsistencia = String(recSigla).toUpperCase().trim() === 'ASISTIO'
    
    if (isRecAsistencia) countRec++
    if (isFormAsistencia) countForm++
  }
  return { rec: countRec, form: countForm }
}
export async function getDetalleCalibracion(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return []

  const fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana)

  const { data: rawRecAsis } = await supabase.from('nominas').select('documento, dia_1, apellido_paterno, apellido_materno, nombres').eq('grupo_codigo', grupo_codigo).eq('campana', campana)
  
  const descSet = await getDescuentosSetGlobal();
  const recAsis = descSet.size > 0
    ? (rawRecAsis || []).filter(r => !descSet.has(makeDescuentoKey(r.documento, campana, grupo_codigo)))
    : (rawRecAsis || []);
  
  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = ''
    if (row.fecha_registro_asistencia) {
      const parts = row.fecha_registro_asistencia.split('/')
      if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  if (!recAsis) return []

  const mapNombres = new Map(recAsis.map(p => [p.documento, `${p.apellido_paterno || ''} ${p.apellido_materno || ''}, ${p.nombres || ''}`.trim()]))

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else {
      const existing = mapFormFull.get(doc)
      if (f.motivo_baja === 'BAJA DIA 1') {
        mapFormFull.set(doc, f)
      } else if (existing.motivo_baja !== 'BAJA DIA 1' && f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      } else if (f.fecha_asistencia === fecha_dia1_ref) {
        mapFormFull.set(doc, f)
      }
    }
  }

  const mapRec = new Map(recAsis.map(r => [r.documento, r.dia_1]))
  
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  const discrepancias = []
  
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc)
    
    if (!recSigla) continue;
    
    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
    
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    const displayFormSigla = isBajaDia1 ? 'BAJA DÍA 1' : formSigla;
    
    const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP'
    const isRecAsistencia = String(recSigla).toUpperCase().trim() === 'ASISTIO'
    
    if (isFormAsistencia !== isRecAsistencia) {
      discrepancias.push({
        documento: doc,
        nombre: mapNombres.get(doc) || 'Desconocido',
        sigla_formador: displayFormSigla,
        sigla_reclutador: String(recSigla).toUpperCase().trim()
      })
    }
  }
  
  return discrepancias
}




function parseCSV(text) {
  const result = [];
  let row = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        row.push(currentVal);
        if (row.some(v => v !== '')) {
          result.push(row);
        }
        row = [];
        currentVal = '';
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentVal || row.length > 0) {
    row.push(currentVal);
    result.push(row);
  }
  return result;
}

export async function fetchGoogleFormsPool(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Error al descargar el archivo: ' + response.statusText)
    const text = await response.text()
    const matrix = parseCSV(text)
    
    if (matrix.length < 2) return []
    
    // Clean headers
    for (let i = 0; i < Math.min(matrix.length, 10); i++) {
      if (matrix[i].some(c => String(c).toUpperCase().includes('DNI'))) {
        const { mapGoogleFormHeaders, parseGoogleFormRow } = await import('./nominaConsolidadoSchema.js')
        const colIdx = mapGoogleFormHeaders(matrix[i])
        
        let rows = []
        for (let j = i + 1; j < matrix.length; j++) {
          const row = matrix[j]
          // Ignore empty rows
          if (!row.some(c => String(c).trim() !== '')) continue
          rows.push(parseGoogleFormRow(row, colIdx))
        }
        
        // Reverse to show newest first, and limit to top 800 to avoid saturation
        rows = rows.reverse().slice(0, 800)
        return rows
      }
    }
    return []
  } catch (err) {
    console.error('fetchGoogleFormsPool error:', err)
    throw err
  }
}

// ── DESCUENTOS API ──────────────────────────────────────────────────────────

export async function fetchDescuentosPendientes() {
  if (DB_MODE !== 'supabase') return [];
  
  // La auto-aprobación ahora se maneja vía pg_cron en la base de datos a las 23:00 diarias.

  const { data, error } = await supabase
    .from('descuentos')
    .select('*')
    .eq('procede', 'PENDIENTE')
    .order('fecha_registro', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchHomologadas() {
  if (DB_MODE !== 'supabase') return [];
  const { data, error } = await supabase
    .from('opciones_homologadas')
    .select('*');
  if (error) {
    console.error("Error fetching homologadas:", error);
    return [];
  }
  return data || [];
}

export async function fetchDescuentosHistorial() {
  if (DB_MODE !== 'supabase') return [];
  const { data, error } = await supabase
    .from('descuentos')
    .select('*')
    .neq('procede', 'PENDIENTE')
    .order('fecha_registro', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function fetchAllDescuentosBI() {
  if (DB_MODE !== 'supabase') return [];
  
  let allData = [];
  let from = 0;
  const step = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('descuentos')
      .select('*')
      .order('fecha_registro', { ascending: false })
      .range(from, from + step - 1);
      
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allData = allData.concat(data);
    if (data.length < step) break;
    
    from += step;
  }
  
  return allData;
}

export async function insertDescuentosBulk(payloads, userEmail) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!payloads || payloads.length === 0) return { inserted: 0 };

  const batch = payloads.map(p => {
    // Si la condición Fuera de Plazo se cumple al subir,
    // aprobamos automáticamente emulando el script original de GAS.
    const isFueraDePlazo = (String(p.fuera_de_plazo || '').trim().toUpperCase() === 'SI');
    
    return {
      sede: p.sede || '',
      segmento: p.segmento || '',
      grupo_cap: p.grupo_cap || '',
      campana: p.campana || '',
      supervisor: p.supervisor || '',
      formador: p.formador || '',
      dni_ce: p.dni_ce || '',
      postulante: p.postulante || '',
      fecha_baja: p.fecha_baja || null,
      motivo: p.motivo || '',
      comentarios: p.comentarios || '',
      bono: 'NO',
      autoriza_cap: 'SI',
      fuera_de_plazo: isFueraDePlazo ? 'SI' : 'NO',
      
      // Regla de aprobación automática (48h)
      autoriza_rys: isFueraDePlazo ? 'SI' : '',
      comentario_rys: isFueraDePlazo ? 'APROBACION 48 HORAS HABILES.' : '',
      procede: isFueraDePlazo ? 'PROCEDE' : 'PENDIENTE',
      
      usuario_registro: userEmail || 'admin'
    };
  });

  const { data, error } = await supabase.from('descuentos').insert(batch);
  if (error) throw error;
  
  batch.forEach(row => {
    mockAuditLog('descuentos', 'INSERT_BULK', row.dni_ce, null, row);
  });
  
  return { inserted: batch.length };
}

export async function updateDescuentosAutorizacionBulk(ids, estado, comentario) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!ids || ids.length === 0) return { updated: 0 };
  
  const { data, error } = await supabase
    .from('descuentos')
    .update({ 
      autoriza_cap: estado, 
      autoriza_rys: estado, 
      comentario_rys: comentario || '',
      procede: estado === 'SI' ? 'PROCEDE' : 'NO PROCEDE',
      usuario_autoriza: (await supabase.auth.getSession()).data?.session?.user?.email || 'admin',
      fecha_autorizacion: new Date().toISOString()
    })
    .in('id', ids)
    .select();
    
  if (error) throw error;
  
  (data || []).forEach(row => {
    mockAuditLog('descuentos', 'AUTORIZAR_RYS', row.id, null, { estado, comentario });
  });

  return { updated: (data || []).length };
}

export async function updateDescuentosIndividuales(updatesArray) {
  if (DB_MODE !== 'supabase') throw new Error("Requires Supabase");
  if (!updatesArray || updatesArray.length === 0) return { updated: 0 };
  
  // Supabase no soporta un UPDATE masivo con diferentes valores por fila en una sola query REST.
  // Debemos ejecutar una query de update para cada fila, o usar un RPC.
  // Dado que normalmente son pocos registros a la vez, lo haremos de forma iterativa.
  
  let successCount = 0;
  for (const update of updatesArray) {
    if (update.estado === undefined) continue; // Skip if no estado provided
    
    // Calcular el Procede según la fórmula
    let procedeStr = 'PENDIENTE';
    const autCap = update.autoriza_cap || '';
    const autRys = update.estado || '';
    
    if (autCap === '' && autRys === 'SI') {
      procedeStr = 'PENDIENTE';
    } else if (autCap === '' || autRys === '') {
      procedeStr = '';
    } else if (autCap === 'SI' && autRys === 'SI') {
      procedeStr = 'PROCEDE';
    } else {
      procedeStr = 'NO PROCEDE';
    }
    
    const { error: updErr } = await supabase
      .from('descuentos')
      .update({ 
        autoriza_rys: update.estado, 
        comentario_rys: update.comentario || '',
        procede: procedeStr,
        usuario_autoriza: (await supabase.auth.getSession()).data?.session?.user?.email || 'admin',
        fecha_autorizacion: new Date().toISOString()
      })
      .eq('id', update.id);
      
    if (!updErr) {
      successCount++;
      mockAuditLog('descuentos', 'AUTORIZAR_RYS_INDIVIDUAL', update.id, null, { estado: update.estado, comentario: update.comentario, procede: procedeStr });
    }
  }

  return { updated: successCount };
}

// ───────────────────────────────────────────────────────────────────────
// GESTIÓN DINÁMICA DE DASHBOARDS LINKS
// ───────────────────────────────────────────────────────────────────────

export async function fetchDashboardsLinks() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('dashboards_links')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet, return empty
        return [];
      }
      throw error;
    }
    return data || [];
  }
  
  // Local storage fallback
  initLocalStorageDb();
  return getFromStorage('dashboards_links') || [];
}

export async function saveDashboardLink(payload) {
  if (DB_MODE === 'supabase') {
    const isNew = !payload.id;
    
    // Convert roles array to jsonb format for Supabase if needed, though supabase-js handles arrays automatically for jsonb columns
    const dataToSave = {
      nombre: payload.nombre,
      url: payload.url,
      roles: payload.roles || []
    };
    
    if (isNew) {
      const { data, error } = await supabase
        .from('dashboards_links')
        .insert([dataToSave])
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('dashboards_links')
        .update(dataToSave)
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }
  
  // Local storage fallback
  initLocalStorageDb();
  const links = getFromStorage('dashboards_links') || [];
  
  if (payload.id) {
    const idx = links.findIndex(l => l.id === payload.id);
    if (idx >= 0) {
      links[idx] = { ...links[idx], ...payload };
      saveToStorage('dashboards_links', links);
      return links[idx];
    }
  } else {
    const newLink = { ...payload, id: 'dl-' + Date.now(), created_at: new Date().toISOString() };
    links.push(newLink);
    saveToStorage('dashboards_links', links);
    return newLink;
  }
}

// ───────────────────────────────────────────────────────────────────────
// PROPUESTAS Y CONSOLIDADO DE PAGOS
// ───────────────────────────────────────────────────────────────────────

export async function fetchPropuestasConsolidado() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('propuestas_consolidado')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      if (error.code === '42P01') {
        console.warn("Table propuestas_consolidado doesn't exist. Falling back to local storage.");
        // continue to local storage below
      } else {
        throw error;
      }
    } else {
      return data || [];
    }
  }
  
  initLocalStorageDb();
  return getFromStorage('propuestas_consolidado') || [];
}

export async function savePropuesta(payloadForm, payloadConsolidado) {
  if (DB_MODE === 'supabase') {
    let propId = payloadForm.id;
    let savedForm;

    try {
      // 1. Save RAW Form
      if (!propId) {
        const { data, error } = await supabase
          .from('propuestas')
          .insert([payloadForm])
          .select()
          .single();
        if (error) throw error;
        savedForm = data;
        propId = data.id;
      } else {
        const { data, error } = await supabase
          .from('propuestas')
          .update(payloadForm)
          .eq('id', propId)
          .select()
          .single();
        if (error) throw error;
        savedForm = data;
      }

      // 2. Save Consolidado
      const consPayload = { ...payloadConsolidado, propuesta_id: propId };
      // Try to check if consolidado exists
      const { data: existingCons } = await supabase
        .from('propuestas_consolidado')
        .select('id')
        .eq('propuesta_id', propId)
        .maybeSingle();

      if (existingCons) {
        await supabase
          .from('propuestas_consolidado')
          .update(consPayload)
          .eq('propuesta_id', propId);
      } else {
        await supabase
          .from('propuestas_consolidado')
          .insert([consPayload]);
      }
      
      return savedForm;
    } catch (error) {
      console.warn("Supabase Error saving propuestas (may need tables created):", error);
      // Fallback to local storage below if supabase fails
    }
  }
  
  // Local Storage Fallback
  initLocalStorageDb();
  const props = getFromStorage('propuestas') || [];
  const cons = getFromStorage('propuestas_consolidado') || [];
  
  let newProp;
  if (payloadForm.id) {
    const idx = props.findIndex(l => l.id === payloadForm.id);
    if (idx >= 0) {
      props[idx] = { ...props[idx], ...payloadForm, updated_at: new Date().toISOString() };
      newProp = props[idx];
      saveToStorage('propuestas', props);
    }
  }
  
  if (!newProp) {
    newProp = { ...payloadForm, id: 'prop-' + Date.now(), created_at: new Date().toISOString() };
    props.push(newProp);
    saveToStorage('propuestas', props);
  }

  // Handle consolidado local
  const consPayload = { ...payloadConsolidado, propuesta_id: newProp.id, created_at: newProp.created_at || new Date().toISOString() };
  const consIdx = cons.findIndex(c => c.propuesta_id === newProp.id);
  if (consIdx >= 0) {
    cons[consIdx] = { ...cons[consIdx], ...consPayload };
  } else {
    cons.push(consPayload);
  }
  saveToStorage('propuestas_consolidado', cons);
  
  return newProp;
}

export async function deleteDashboardLink(id) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase
      .from('dashboards_links')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }
  
  // Local storage fallback
  initLocalStorageDb();
  const links = getFromStorage('dashboards_links') || [];
  const filtered = links.filter(l => l.id !== id);
  saveToStorage('dashboards_links', filtered);
  return true;
}

// ==========================================
// EQUIPO DE RECLUTAMIENTO
// ==========================================

export async function getEquipoReclutamiento() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .select('*')
      .order('nombres_completos');
      
    if (error) {
      console.error("Error fetching equipo_reclutamiento:", error);
      return [];
    }
    return data || [];
  }
  
  return [];
}

export async function updateEquipoReclutamiento(documento, payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_reclutamiento:", error);
      throw error;
    }
    return data;
  }
  return null;
}

export async function addEquipoReclutamiento(payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .insert([{ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_reclutamiento:", error);
      throw error;
    }
    return data;
  }
  return null;
}

// ==========================================
// EQUIPO DE FORMACION
// ==========================================

export async function getEquipoFormacion() {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_formacion')
      .select('*')
      .order('nombres_completos');
      
    if (error) {
      console.error("Error fetching equipo_formacion:", error);
      return [];
    }
    return data || [];
  }
  
  return [];
}

export async function updateEquipoFormacion(documento, payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_formacion')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_formacion:", error);
      throw error;
    }
    return data;
  }
  return null;
}

export async function addEquipoFormacion(payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase
      .from('equipo_formacion')
      .insert([{ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_formacion:", error);
      throw error;
    }
    return data;
  }
  return null;
}

// ==========================================
// ASIGNACION FORMADORES
// ==========================================

export async function updateGrupoFormador(grupo_codigo, formador_documento) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase
      .from('capacidad_rys')
      .update({ formador_documento })
      .eq('codigo', grupo_codigo);
      
    if (error) {
      console.error('Error actualizando formador del grupo:', error);
      throw error;
    }
    
    // Auditar
    mockAuditLog('capacidad_rys', 'UPDATE', grupo_codigo, null, { formador_documento });
    
    return true;
  }
  return false;
}

export async function getMetricasReporteCalibracionBulk(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return []
  
  const codigos = [...new Set(gruposInfo.map(g => g.codigo))];
  const campanas = [...new Set(gruposInfo.map(g => g.campana))];

  // Fetch nominas with pagination
  let nominasAll = [];
  let nFrom = 0;
  const nStep = 1000;
  let nHasMore = true;
  while(nHasMore) {
    const { data } = await supabase.from('nominas')
      .select('documento, dia_0, dia_1, activo, grupo_codigo, campana')
      .in('grupo_codigo', codigos)
      .in('campana', campanas)
      .range(nFrom, nFrom + nStep - 1);
    if(data && data.length > 0) {
      nominasAll = nominasAll.concat(data);
      if(data.length < nStep) nHasMore = false;
      else nFrom += nStep;
    } else nHasMore = false;
  }

  // Fetch configs
  const { data: configAll } = await supabase.from('grupos_dia1')
    .select('estado_calibracion, fecha_dia1, grupo_codigo, campana')
    .in('grupo_codigo', codigos)
    .in('campana', campanas);

  // Fetch consolidado with pagination
  let formAsisAll = [];
  let fFrom = 0;
  const fStep = 1000;
  let fHasMore = true;
  while(fHasMore) {
    const { data } = await supabase.from('consolidado_asistencias')
      .select('documento, fecha_registro_asistencia, sigla, motivo_baja, codigo_grupo, campana')
      .in('codigo_grupo', codigos)
      .in('campana', campanas)
      .range(fFrom, fFrom + fStep - 1);
    if(data && data.length > 0) {
      formAsisAll = formAsisAll.concat(data);
      if(data.length < fStep) fHasMore = false;
      else fFrom += fStep;
    } else fHasMore = false;
  }

  const descSet = await getDescuentosSetGlobal();

  const configMap = new Map();
  if (configAll) {
    configAll.forEach(c => {
      configMap.set(`${c.campana}|${c.grupo_codigo}`, c);
    });
  }

  const nominasGrouped = new Map();
  if (nominasAll) {
    nominasAll.forEach(n => {
      const key = `${n.campana}|${n.grupo_codigo}`;
      if (!nominasGrouped.has(key)) nominasGrouped.set(key, []);
      nominasGrouped.get(key).push(n);
    });
  }

  const formAsisGrouped = new Map();
  if (formAsisAll) {
    formAsisAll.forEach(f => {
      const key = `${f.campana}|${f.codigo_grupo}`;
      if (!formAsisGrouped.has(key)) formAsisGrouped.set(key, []);
      formAsisGrouped.get(key).push(f);
    });
  }

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana } = grupoInfo;
    const groupKey = `${campana}|${grupo_codigo}`;
    
    let totalNomina = 0;
    let totalDia0 = 0;
    let countRec = 0;
    
    const nominas = nominasGrouped.get(groupKey) || [];
    const validNominas = descSet.size > 0 
      ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : nominas;
      
    totalNomina = validNominas.length;
    totalDia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length;
    countRec = validNominas.filter(n => String(n.dia_1).toUpperCase().trim() === 'ASISTIO').length;

    const config = configMap.get(groupKey);
    let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';
    let fecha_dia1_ref = config?.fecha_dia1 || null;

    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || [];
    if (!fecha_dia1_ref && groupFormAsisRaw.length > 0) {
       let earliestIso = null;
       let earliestRaw = null;
       
       for (const row of groupFormAsisRaw) {
         if (row.fecha_registro_asistencia) {
            const parts = row.fecha_registro_asistencia.split('/')
            if (parts.length === 3) {
               const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
               if (!earliestIso || iso < earliestIso) {
                 earliestIso = iso;
                 earliestRaw = row.fecha_registro_asistencia;
               }
            }
         }
       }
       fecha_dia1_ref = earliestRaw;
    }

    let countForm = 0;
    if (fecha_dia1_ref) {
      const formAsis = groupFormAsisRaw.filter(f => f.fecha_registro_asistencia).map(row => {
        return {
          postulante_documento: row.documento,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
          fecha_asistencia: row.fecha_registro_asistencia
        }
      });

      const mapFormFull = new Map()
      for (const f of formAsis) {
        const doc = f.postulante_documento
        if (!mapFormFull.has(doc)) {
          mapFormFull.set(doc, f)
        } else {
          const existing = mapFormFull.get(doc)
          if (f.motivo_baja === 'BAJA DIA 1') {
            mapFormFull.set(doc, f)
          } else if (existing.motivo_baja !== 'BAJA DIA 1' && f.fecha_asistencia === fecha_dia1_ref) {
            mapFormFull.set(doc, f)
          } else if (f.fecha_asistencia === fecha_dia1_ref) {
            mapFormFull.set(doc, f)
          }
        }
      }

      const mapRec = new Map(validNominas.map(r => [r.documento, r.dia_1]))
      const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
      let isCalibrated = true
      for (const doc of allDocs) {
        const formRecord = mapFormFull.get(doc)
        const recSigla = mapRec.get(doc) 
        
        if (!recSigla) continue;

        const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
        const isBajaDia1 = formRecord && formSigla === 'B' && formRecord.motivo_baja === 'BAJA DIA 1'
        const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
        
        const isFormAsistencia = effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP'
        const isRecAsistencia = String(recSigla).toUpperCase().trim() === 'ASISTIO'
        
        if (isFormAsistencia) countForm++;

        if (isFormAsistencia !== isRecAsistencia) {
          isCalibrated = false
        }
      }
    }

    if (estado_calibracion === 'PENDIENTE' && fecha_dia1_ref) {
      if (countRec !== countForm) {
        estado_calibracion = 'DESCALIBRADO';
      } else if (countRec > 0 || countForm > 0) {
        estado_calibracion = 'CALIBRADO';
      }
    }

    results.push({
      grupo_codigo: grupo_codigo,
      campana: campana || '',
      fecha_inicio: grupoInfo.fecha_inicio || '',
      fecha_dia1: fecha_dia1_ref || 'No definida',
      estado: estado_calibracion,
      total_nomina: totalNomina,
      total_dia0: totalDia0,
      total_reclutador: countRec,
      total_formador: countForm
    });
  }

  return results;
}

export async function fetchModulePermissions() {
  const { data, error } = await supabase.from('module_permissions').select('*')
  if (error) {
    console.error('Error fetching module_permissions:', error)
    return []
  }
  return data
}

export async function updateModulePermissions(moduleId, roles) {
  const { error } = await supabase
    .from('module_permissions')
    .upsert({ module_id: moduleId, roles })
  
  if (error) throw error
  return true
}
