import * as XLSX from 'xlsx';
/**
 * dataService.js
 * Capa de abstracción de datos: usa Supabase si está configurado,
 * si no, cae al mock de localStorage automáticamente.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { enrichGruposWithStats, inferSegmento } from './capacidadRysSync'
import { SHEET_SOURCES, sheetCsvUrl } from './sheetSources.js'
import { parseCsvToMatrix, parseNominaRows, cleanDocumento } from './nominaConsolidadoSchema.js'
import { asistenciaRecordsFromNominaRow, extractGruposFromRows } from './sheetImportUtils.js'
import { atribuirBaja } from './flujoOperativo.js'
import { parseCapacidadRysCsv } from './capacidadRysSchema.js'
import {
  getFromStorage,
  saveToStorage,
  addAuditLog as mockAuditLog,
  initLocalStorageDb
} from './mockData'

export const DB_MODE = isSupabaseConfigured() ? 'supabase' : 'local'

// ─────────────────────────────────────────────
// CACHE LAYER
// ─────────────────────────────────────────────
const apiCache = new Map();

async function withCache(key, ttlMs = 300000, fetcher) {
  if (DB_MODE !== 'supabase') return fetcher();
  
  const now = Date.now();
  const cached = apiCache.get(key);
  if (cached && (now - cached.timestamp < ttlMs)) {
    return cached.data;
  }
  
  const data = await fetcher();
  if (data !== null && data !== undefined) {
    apiCache.set(key, { data, timestamp: now });
  }
  return data;
}

export function invalidateCache(keyPrefix) {
  if (!keyPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      apiCache.delete(key);
    }
  }
}

export function isBajaDia1(motivo, sigla, row) {
  const m = String(motivo || '').toUpperCase().trim();
  const s = String(sigla || '').toUpperCase().trim();
  const t = String(row?.tipo_baja || row?.tipo || '').toUpperCase().trim();
  
  if (t.includes('DIA_1') || t.includes('DIA 1') || t.includes('D1')) return true;
  if (s === 'BD1' || s === 'D1') return true;
  if (
    m === 'BAJA DIA 1' || 
    m === 'BAJA DÍA 1' || 
    m === 'BAJA D1' || 
    m === 'DÍA 1' || 
    m === 'DIA 1' || 
    m.includes('BAJA DIA 1') || 
    m.includes('BAJA DÍA 1') || 
    m.includes('BAJA D1') ||
    m.includes('(BAJA DIA 1)') ||
    m.includes('(BAJA DÍA 1)')
  ) return true;
  return false;
}

export function isBajaCapacitacion(row) {
  if (!row) return false;
  const motivo = row.motivo_baja || row.motivo || '';
  const sigla = row.sigla || row.sigla_asistencia || '';
  if (isBajaDia1(motivo, sigla, row)) return false;

  const s = String(sigla || '').toUpperCase().trim();
  const m = String(motivo || '').toUpperCase().trim();
  const e = String(row.estado || '').toUpperCase().trim();

  return (
    s === 'B' || 
    s === 'BAJA' || 
    e === 'CESADO' || 
    (e.includes('BAJA') && !e.includes('BAJA DIA 1') && !e.includes('BAJA DÍA 1')) ||
    (m !== '' && m !== 'NULL' && m !== 'ASISTIO' && m !== 'ACTIVO')
  ) && s !== 'ASISTIO' && s !== 'A' && s !== 'I-OP';
}

export function normalizarMotivo(motivoCrudo) {
  if (!motivoCrudo) return 'SIN ESPECIFICAR';
  const m = String(motivoCrudo).trim().toUpperCase();
  if (!m || m === 'NULL' || m === 'UNDEFINED' || m === 'BAJA' || m === 'CESADO' || m === 'INACTIVO' || m === 'SIN ESPECIFICAR' || m === 'BAJA SIN ESPECIFICAR') {
    return 'SIN ESPECIFICAR';
  }

  // Normalizaciones ortográficas y limpieza de typos preservando cada motivo específico
  if (m === 'NO CONTACTO' || m.includes('NO CONTACTO')) return 'NO CONTACTO';
  if (m.includes('FALTA DOUMENTACION') || m.includes('FALTA DOCUMENTACION') || m.includes('FALTA DOCUMENTACIÓN')) return 'FALTA DOCUMENTACIÓN';
  if (m === 'FAMILIAR' || m.includes('FAMILIAR')) return 'FAMILIAR';
  if (m === 'SALUD' || m.includes('SALUD')) return 'SALUD';
  if (m === 'MEJOR OFERTA LABORAL') return 'MEJOR OFERTA LABORAL';
  if (m === 'OFERTA NO FAVORABLE') return 'OFERTA NO FAVORABLE';
  if (m.includes('OFERTA LABORAL')) return 'OFERTA LABORAL';
  if (m === 'ESTUDIA DERECHO') return 'ESTUDIA DERECHO';
  if (m.includes('ESTUDIO') || m.includes('ESTUDIOS')) return 'ESTUDIOS';
  if (m.includes('VIAJE')) return 'VIAJE';
  if (m.includes('FACILIDADES TECNICA') || m.includes('FACILIDADES TÉCNICA')) return 'FACILIDADES TÉCNICAS';
  if (m.includes('FALTAS CONSECUTIVA') || m.includes('FALTAS CONSTANTE') || m.includes('FALTAS REITERADA')) return 'FALTAS CONSECUTIVAS';
  if (m.includes('TARDANZAS CONSECUTIVA')) return 'TARDANZAS CONSECUTIVAS';
  if (m.includes('BLACK LIST CLIENTE')) return 'BLACK LIST CLIENTE';
  if (m.includes('BLACK LIST GEA') || m.includes('BLACKLIST')) return 'BLACK LIST GEA';
  if (m.includes('HABILIDAD COMERCIAL')) return 'HABILIDAD COMERCIAL';
  if (m.includes('HABILIDAD ATC')) return 'HABILIDAD ATC';
  if (m.includes('DICCION') || m.includes('DICCIÓN')) return 'DICCIÓN';
  if (m.includes('DESAPROBADO EN OJT')) return 'DESAPROBADO EN OJT';
  if (m === 'DESAPROBADO') return 'DESAPROBADO';
  if (m.includes('ECONOMICO') || m.includes('ECONÓMICO')) return 'ECONÓMICO';
  if (m.includes('REINGRESO NO APTO')) return 'REINGRESO NO APTO';
  if (m.includes('DESISTIMIENTO POR CONTRATO') || m.includes('DESISTIMIENTO')) return 'DESISTIMIENTO POR CONTRATO';
  if (m.includes('DISTANCIA')) return 'DISTANCIA';
  if (m.includes('ACTITUD')) return 'ACTITUD';
  if (m.includes('MANEJO DE PC')) return 'MANEJO DE PC';
  if (m.includes('EMBARAZO')) return 'EMBARAZO';
  if (m.includes('USUARIO ACTIVO EN OTRO CALL')) return 'USUARIO ACTIVO EN OTRO CALL';
  if (m.includes('USUARIOS SIN ACCESOS')) return 'USUARIOS SIN ACCESOS COMPLETOS';
  if (m.includes('SOBREDOTACION') || m.includes('SOBREDOTACIÓN')) return 'SOBREDOTACIÓN';
  if (m.includes('PERFIL DEL POSTULANTE')) return 'PERFIL DEL POSTULANTE';
  if (m.includes('RETIRO APROBADO POR JEFATURA')) return 'RETIRO APROBADO POR JEFATURA';

  return m;
}

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

  const attachNombreCompleto = async (profile, sessionUser = null) => {
    if (!profile) return profile;
    try {
      const email = String(sessionUser?.email || '').toLowerCase().trim();
      const userAlix = email.includes('@') ? email.split('@')[0] : '';
      const searchTerm = String(profile.nombre || '').trim();

      // 1. Check in equipo_reclutamiento
      if (userAlix) {
        const { data: recByAlix } = await supabase
          .from('equipo_reclutamiento')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix')
          .eq('alix', userAlix)
          .maybeSingle();

        if (recByAlix) {
          const full = `${recByAlix.apellido_paterno || ''} ${recByAlix.apellido_materno || ''} ${recByAlix.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = recByAlix.documento;
          profile.dni = recByAlix.documento;
          return profile;
        }
      }

      if (searchTerm) {
        const { data: recData } = await supabase
          .from('equipo_reclutamiento')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, alix')
          .or(`alix.eq.${searchTerm},nombres_completos.eq.${searchTerm}`)
          .maybeSingle();

        if (recData) {
          const full = `${recData.apellido_paterno || ''} ${recData.apellido_materno || ''} ${recData.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = recData.documento;
          profile.dni = recData.documento;
          return profile;
        }
      }

      // 2. Check in equipo_formacion
      if (userAlix) {
        const { data: formByAlix } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix')
          .eq('usuario_alix', userAlix)
          .maybeSingle();

        if (formByAlix) {
          const full = `${formByAlix.apellido_paterno || ''} ${formByAlix.apellido_materno || ''} ${formByAlix.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = formByAlix.documento;
          profile.formador_documento = formByAlix.documento;
          return profile;
        }
      }

      if (searchTerm) {
        const { data: formData } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, usuario_alix')
          .or(`usuario_alix.eq.${searchTerm},nombres_completos.eq.${searchTerm}`)
          .maybeSingle();

        if (formData) {
          const full = `${formData.apellido_paterno || ''} ${formData.apellido_materno || ''} ${formData.nombres_completos || ''}`.trim().replace(/\s+/g, ' ');
          profile.nombre_completo = full;
          profile.nombre = full;
          profile.documento = formData.documento;
          profile.formador_documento = formData.documento;
          return profile;
        }
      }
    } catch(e) {
      console.warn("attachNombreCompleto error:", e);
    }
    
    profile.nombre_completo = profile.nombre;
    return profile;
  };

  // 1. Intentar RPC get_my_profile
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_profile')
  if (!rpcErr && rpcData) return await attachNombreCompleto(rpcData, sessionUser)

  // 2. Consulta canónica a perfiles incluyendo segmento si existe
  let { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, segmento')
    .eq('id', userId)
    .maybeSingle()

  if (error && (error.code === 'PGRST204' || error.message?.includes('segmento') || error.code === '42703')) {
    const fallbackRes = await supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .eq('id', userId)
      .maybeSingle()
    data = fallbackRes.data
    error = fallbackRes.error
  }

  if (error) throw error
  if (data) return await attachNombreCompleto(data, sessionUser)

  // Perfil ausente: intentar crear desde metadata de la sesión
  if (sessionUser) {
    const bootstrap = profileFromSession(sessionUser)
    const { data: inserted, error: insErr } = await supabase
      .from('perfiles')
      .upsert(bootstrap)
      .select('id, nombre, rol')
      .single()
    if (!insErr && inserted) return await attachNombreCompleto(inserted)
    return await attachNombreCompleto(bootstrap)
  }

  return null
}

// ─────────────────────────────────────────────
// ROLES DINÁMICOS
// ─────────────────────────────────────────────
export function fetchAppRoles() {
  return withCache('config_roles', 600000, async () => {
    if (DB_MODE !== 'supabase') return []
    const { data, error } = await supabase.from('config_roles').select('*').order('created_at', { ascending: true })
    if (error) throw error
    return data
  });
}

export async function createAppRole(roleData) {
  if (DB_MODE !== 'supabase') return null
  const { data, error } = await supabase.from('config_roles').insert([roleData]).select().single()
  if (error) throw error
  invalidateCache('config_roles')
  return data
}

const normalizeGPE = (val) => String(val || '').replace(/^GPE-?/i, '').trim();
const normalizeCampana = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const normalizeDNI = (d) => String(d || '').trim(); // Don't padStart yet in case CE is alphanumeric

const makeDescuentoKey = (doc, camp, grupo) => {
  return `${normalizeDNI(doc)}|${normalizeCampana(camp)}|${normalizeGPE(grupo)}`;
}

export function getDescuentosSetGlobal() {
  // QW-3: Cachear el cálculo del Set de descuentos autorizados (TTL: 5 min)
  return withCache('descuentos_set_global', 300000, async () => {
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
  });
}

async function fetchAllConsolidado() {
  return withCache('all_consolidado', 180000, async () => {
    // 1. Obtener conteo exacto ultra-rápido (head query, ~40ms)
    const { count, error: countErr } = await supabase
      .from('consolidado_asistencias')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;

    const totalCount = count || 0;
    if (totalCount === 0) return [];

    const step = 5000;
    const chunkPromises = [];
    for (let from = 0; from < totalCount; from += step) {
      chunkPromises.push(
        supabase
          .from('consolidado_asistencias')
          .select('id, documento, motivo_baja, fecha_registro_asistencia, campana, codigo_grupo, grupo, nombre_formador, apellido_paterno, apellido_materno, nombres, sigla, estado, condicion_laboral, tipo_reclutado, archivo_origen')
          .order('created_at', { ascending: true })
          .range(from, from + step - 1)
      );
    }

    const [descSet, ...results] = await Promise.all([
      getDescuentosSetGlobal(),
      ...chunkPromises
    ]);

    let allData = [];
    for (const res of results) {
      if (res.error) throw res.error;
      if (res.data && res.data.length > 0) {
        allData = allData.concat(res.data);
      }
    }

    if (descSet && descSet.size > 0) {
      allData = allData.filter(row => !descSet.has(makeDescuentoKey(row.documento, row.campana, row.codigo_grupo)));
    }

    return allData;
  });
}
export async function getFirstDateFormador(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;
  const { data } = await supabase
    .from('consolidado_asistencias')
    .select('fecha_registro_asistencia')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana);
    
  if (!data || data.length === 0) return null;
  
  let earliestIso = null;
  for (const row of data) {
    if (row.fecha_registro_asistencia) {
      const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
      if (iso && (!earliestIso || iso < earliestIso)) {
        earliestIso = iso;
      }
    }
  }
  return earliestIso;
}

export async function getMetricasReporteCalibracion(grupo_codigo, campana) {
  if (DB_MODE !== 'supabase') return null;

  const { data: nominas } = await supabase.from('nominas').select('documento, dia_0, dia_1, activo').eq('grupo_codigo', grupo_codigo).eq('campana', campana);
  
  let totalNomina = 0;
  let totalDia0 = 0;
  let countRec = 0;
  
  const descSet = await getDescuentosSetGlobal();
  const validNominas = nominas && descSet.size > 0 
    ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
    : (nominas || []);
    
  totalNomina = validNominas.length;
  totalDia0 = validNominas.filter(n => String(n.dia_0).toUpperCase().trim() === 'ASISTIO').length;
  
  const { data: rawFormAsis } = await supabase.from('consolidado_asistencias')
    .select('documento, motivo_baja, estado')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana);

  const groupFormAsisRaw = rawFormAsis || [];

  for (const n of validNominas) {
    if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
      const records = groupFormAsisRaw.filter(r => r.documento === n.documento);
      const isBajaDia1 = records.some(r => {
        const m = String(r.motivo_baja || '').toUpperCase();
        const e = String(r.estado || '').toUpperCase();
        return m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1');
      });
      if (!isBajaDia1) {
        countRec++;
      }
    }
  }
  
  const { data: config } = await supabase.from('grupos_dia1').select('estado_calibracion, fecha_dia1').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle();
  let fecha_dia1_ref = config?.fecha_dia1 || null;

  if (!fecha_dia1_ref) {
    fecha_dia1_ref = await getFirstDateFormador(grupo_codigo, campana);
  }
  const counts = await getCalibracionCounts(grupo_codigo, campana);
  const countForm = counts.form;

  let estado_calibracion = 'PENDIENTE';
  if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
    estado_calibracion = 'PENDIENTE';
  } else if (countRec !== countForm) {
    estado_calibracion = 'DESCALIBRADO';
  } else if (countRec > 0 && countForm > 0 && countRec === countForm) {
    estado_calibracion = 'CALIBRADO';
  } else {
    estado_calibracion = 'PENDIENTE';
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
  
  // Método principal: RPC en PostgreSQL (rápido, directo, sin errores de Edge Function ni CORS)
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reset_user_password', {
    p_user_id: userId,
    p_password: newPassword
  })
  
  if (!rpcError && rpcData) {
    return rpcData
  }

  // Si falló el RPC por alguna razón, intentamos como respaldo con Edge Function
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: { userId, password: newPassword }
  })
  
  if (error) {
    throw new Error(rpcError?.message || error.message || 'No se pudo actualizar la contraseña.')
  }
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
    if (rpcMsg.includes('Ya existe') || rpcMsg.includes('already')) {
      const { data: existingProfile } = await supabase
        .from('perfiles')
        .select('id, nombre, rol')
        .or(`nombre.ilike.%${displayName}%,nombre.ilike.%${cleanEmail.split('@')[0]}%`)
        .limit(1)
        .maybeSingle()

      if (existingProfile?.id) {
        await adminResetUserPassword(existingProfile.id, password)
        await updateUserRole(existingProfile.id, safeRol)
        return {
          id: existingProfile.id,
          email: cleanEmail,
          nombre: displayName,
          rol: safeRol
        }
      }
    }
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

export async function updateUserRole(userId, newRole, segmento = null) {
  if (!VALID_ROLES.includes(newRole)) throw new Error('Rol inválido')
  
  const payload = { rol: newRole }
  if (newRole === 'supervisor_capacitacion' && segmento) {
    payload.segmento = segmento
  }

  const { error } = await supabase
    .from('perfiles')
    .update(payload)
    .eq('id', userId)

  if (error) {
    // Si la columna segmento aún no fue agregada a la tabla perfiles vía SQL, guardar rol canónico
    if (error.message?.includes('segmento') || error.code === 'PGRST204' || error.code === '42703') {
      const { error: fallbackErr } = await supabase
        .from('perfiles')
        .update({ rol: newRole })
        .eq('id', userId)
      if (fallbackErr) throw fallbackErr
      return
    }
    throw error
  }
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
    documento: cleanDocumento(payload.documento),
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

/**
export const POSTULANTES_COLUMNS = 'nomina_id, documento, tipo_documento, apellido_paterno, apellido_materno, nombres, celular, celular_referencia, celular_emergencia, contacto_emergencia, parentesco, correo, genero, fecha_nacimiento, edad, estado_civil, n_hijos, nivel_academico, carrera, entidad, nacionalidad, lugar_nacimiento, lugar_residencia, distrito_residencia, direccion_domicilio, periodo_reclutado, semana_trabajo, reclutador, sede, campana, segmento, reclutador_id, fuente_oferta, observacion_reclutamiento, exp_call_center, exp_tipo_campana, exp_tiempo_campana, exp_otra, exp_tiempo_otra, grupo_codigo, modalidad, condicion, horario_gestion, descanso, envio_dni, test_psicologico, validacion_pc, evaluacion_dia_0, fecha_inicio_capacitacion, fecha_fin_capacitacion, fecha_conexion_ojt, fecha_conexion_op, pago_capacitacion, fecha_inscripcion_curso, fecha_ingreso, tipo_trabajo, tipo_contratacion, razon_social, rango_salarial, remuneracion, bono_variable, bono_movilidad, bono_bienvenida, bono_permanencia, bono_asistencia_perfecta, cargo_contractual, dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs, estado, activo, doc_cv, doc_dni_adjunto, doc_certijoven, doc_recibo_servicios, doc_ficha_datos, doc_autorizacion, created_at';

/**
 * QW-2: Limita la descarga inicial de postulantes a 5000 registros para evitar transferencias
 * masivas y saturación en inicios de turno simultáneos.
 * Para obtener todo el histórico completo (ej. exportes Excel), pasar { all: true } o usar fetchAllPostulantes().
 */
export async function fetchPostulantes({ limit = 5000, all = false } = {}) {
  if (DB_MODE === 'supabase') {
    let query = supabase
      .from('v_nominas_consolidado')
      .select(POSTULANTES_COLUMNS)
      .order('created_at', { ascending: false })

    if (!all && limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query
    if (error) throw error
    
    return (data || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento,
    }))
  }
  initLocalStorageDb()
  const list = getFromStorage('postulantes') || []
  return all ? list : list.slice(0, limit)
}

/**
 * Consulta el histórico completo de postulantes/nóminas bajo demanda (para exportes o reportes).
 */
export async function fetchAllPostulantes() {
  return fetchPostulantes({ all: true })
}

/**
 * Consulta todos los postulantes de un reclutador específico, sin límite de filas.
 * Filtra por reclutador_id directamente en Supabase (server-side) para evitar el
 * límite de QW-2 y garantizar que el reclutador vea el 100% de su cartera.
 *
 * @param {number|null} reclutadorId - ID del reclutador de la tabla `reclutadores`
 * @param {string|null} reclutadorNombre - Nombre completo como fallback si no hay ID
 */
export async function fetchPostulantesReclutador(reclutadorId, reclutadorNombre = null) {
  if (DB_MODE === 'supabase') {
    let query = supabase
      .from('v_nominas_consolidado')
      .select(POSTULANTES_COLUMNS)
      .order('created_at', { ascending: false })

    if (reclutadorId) {
      query = query.eq('reclutador_id', reclutadorId)
    } else if (reclutadorNombre) {
      // Fallback: filtro por nombre si no hay reclutador_id mapeado
      query = query.ilike('reclutador', `%${reclutadorNombre}%`)
    } else {
      // Sin ID ni nombre: retornar vacío para no exponer datos de otros
      return []
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento,
    }))
  }
  // Demo/localStorage: filtrar localmente por nombre como fallback
  const list = getFromStorage('postulantes') || []
  if (!reclutadorNombre) return list
  return list.filter(p =>
    p.reclutador?.toLowerCase().includes(reclutadorNombre.toLowerCase())
  )
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
  const cleanPayloads = (payloads || []).filter(p => p && p.documento && String(p.documento).trim());
  if (cleanPayloads.length === 0) return { inserted: [], skipped: [], failed: [], results: [] };

  const targetGrupo = cleanPayloads[0].grupo_codigo;
  const existingDocs = new Set();
  const uniquePayloads = [];
  const skipped = [];

  for (const p of cleanPayloads) {
    const doc = String(p.documento).trim();
    if (existingDocs.has(doc)) {
      skipped.push(doc);
    } else {
      existingDocs.add(doc);
      uniquePayloads.push(p);
    }
  }

  if (DB_MODE === 'supabase') {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('registrar_nominas_bulk', { p_data: uniquePayloads });
    if (rpcErr) {
      console.error('Error en registrar_nominas_bulk:', rpcErr);
      throw rpcErr;
    }

    const insertedRows = (rpcRes?.inserted || []).map(row => ({
      ...row,
      campaign: row.campana,
      observacion: row.observacion_reclutamiento
    }));

    const failed = (rpcRes?.results || [])
      .filter(r => !r.success)
      .map(r => ({ documento: r.documento, reason: r.error }));

    // Generar asistencias asociadas únicamente para los postulantes insertados con éxito
    const insertedDocSet = new Set(insertedRows.map(r => r.documento));
    const allAsistenciaRecords = [];

    for (const p of uniquePayloads) {
      if (insertedDocSet.has(p.documento)) {
        const aRecords = asistenciaRecordsFromNominaRow(p);
        allAsistenciaRecords.push(...aRecords);
      }
    }

    if (allAsistenciaRecords.length > 0) {
      const groupsMap = new Map();
      allAsistenciaRecords.forEach(r => {
        const key = `${r.grupo_codigo}|${r.fecha_asistencia}`;
        if (!groupsMap.has(key)) groupsMap.set(key, { grupo_codigo: r.grupo_codigo, fecha_asistencia: r.fecha_asistencia, registros: [] });
        groupsMap.get(key).registros.push(r);
      });
      
      const asisPromises = [];
      for (const group of groupsMap.values()) {
        asisPromises.push(
          upsertAsistencias({
            grupo_codigo: group.grupo_codigo,
            fecha_asistencia: group.fecha_asistencia,
            records: group.registros
          }).catch(e => console.error("Error upserting asistencias for group:", group.grupo_codigo, e))
        );
      }
      if (asisPromises.length > 0) {
        await Promise.all(asisPromises);
      }
    }

    if (targetGrupo) {
      try {
        await checkCalibracionDia1(targetGrupo);
      } catch(e) {
        console.error("Error checkCalibracionDia1 from insertPostulantesBulk:", e);
      }
    }

    // Invalidar cachés operacionales para reflejar los nuevos registros de inmediato
    invalidateCache('all_consolidado');
    invalidateCache('resumen_cap_');

    return {
      inserted: insertedRows,
      skipped,
      failed,
      results: rpcRes?.results || []
    };
  }

  // Local/Demo Mode fallback
  const list = getFromStorage('postulantes') || [];
  const inserted = [];
  for (const payload of uniquePayloads) {
    const item = { ...payload, id: Date.now() + Math.random() };
    list.push(item);
    inserted.push(item);
  }
  saveToStorage('postulantes', list);
  return { inserted, skipped, failed: [], results: [] };
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

/** 
 * Suscripción realtime a cambios de grupos y nóminas con invalidación de caché.
 * 
 * NOTA DE ARQUITECTURA / PROTECCIÓN DE CARGA (2026-08-23):
 * Se DESACTIVA el auto-reload masivo automático ante eventos postgres_changes de otros clientes.
 * MOTIVO: Con ~100 usuarios concurrentes, un solo insert disparaba loadAllData() completo
 * (17 requests HTTP simultáneas) en cada cliente al mismo milisegundo (Thundering Herd de 1,700 req/s),
 * saturando el connection pooler y el API gateway de Supabase.
 * 
 * ESTRATEGIA APLICADA:
 * 1. La invalidación de caché local se mantiene intacta para que la próxima lectura traiga datos frescos.
 * 2. Las acciones de guardado propio del usuario (asistencias, nóminas, grupos) siguen actualizando su propia vista de inmediato.
 * 3. Los cambios de terceros se sincronizan mediante polling suave (cada 5 min con jitter) y botón manual "Refrescar".
 */
export function subscribeOperationalData(onChange) {
  if (DB_MODE !== 'supabase') return () => {}

  const handleChange = () => {
    // Invalida caché local para asegurar datos frescos en la siguiente consulta del usuario
    invalidateCache('all_consolidado');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('all_motivos_bajas');
    invalidateCache('grupos_con_metas');
    invalidateCache('resumen_cap_');
    
    // Auto-reload masivo desactivado para mitigar picos de carga concurrentes (>100 usuarios)
    // Si se requiere callback específico manual forzado, se puede invocar condicionalmente:
    if (typeof onChange === 'function' && onChange.__allowDirectRealtimeReload) {
      onChange();
    }
  };

  const channel = supabase
    .channel('gea-operational-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'capacidad_rys' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nominas' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias_capacitacion' }, handleChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'consolidado_asistencias' }, handleChange)
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

  // 2. Rescatar datos manuales antes de borrar
  try {
    const { data: existingData } = await supabase.from('capacidad_rys').select('codigo, campana, formador_documento')
    const existingMap = new Map()
    if (existingData) {
      for (const g of existingData) {
        existingMap.set(g.campana + '_' + g.codigo, g.formador_documento)
      }
    }

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
        segmento: p.segmento ? String(p.segmento).trim() : inferSegmento(campana),
        estado: p.estado || 'PLANIFICADO',
        formador_documento: existingMap.get(campana + '_' + codigo) || null,
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
const CAPACIDAD_RYS_GID = '249081259'

export async function syncCapacidadRysFromDrive({ onProgress } = {}) {
  onProgress?.({ phase: 'download', message: 'Descargando hoja de Google Drive…' })

  // Use the published Google Sheets CSV URL pointing directly to CAPA_RYS tab
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${CAPACIDAD_RYS_SHEET_ID}/pub?gid=${CAPACIDAD_RYS_GID}&single=true&output=csv`

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

    const uniqueSheetRows = []
    const seenSheetDocs = new Set()
    for (const row of rows) {
      if (row.documento && !seenSheetDocs.has(row.documento)) {
        seenSheetDocs.add(row.documento)
        uniqueSheetRows.push(row)
      } else {
        result.skipped++
      }
    }

    if (uniqueSheetRows.length > 0) {
      onProgress?.({
        phase: 'nominas',
        sourceId: source.id,
        label: source.label,
        total: uniqueSheetRows.length,
        current: 0,
        message: `Importando lote de ${uniqueSheetRows.length} nóminas…`,
      })

      try {
        const bulkRes = await insertPostulantesBulk(uniqueSheetRows)
        result.nominas += (bulkRes.inserted?.length || 0)
        result.skipped += (bulkRes.skipped?.length || 0)
        if (bulkRes.failed?.length > 0) {
          bulkRes.failed.forEach(f => {
            result.errors.push({ ref: f.documento, message: f.reason })
          })
        }
      } catch (err) {
        result.errors.push({ ref: source.label, message: err.message })
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
      let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
      
      if (isoDate) {
        const key = `${row.documento}_${isoDate}`;
        map.set(key, {
          documento: row.documento,
          postulante_documento: row.documento,
          nombres: row.nombres,
          apellido_paterno: row.apellido_paterno,
          apellido_materno: row.apellido_materno,
          celular: row.celular,
          condicion_laboral: row.condicion_laboral,
          codigo_grupo: row.codigo_grupo,
          grupo_codigo: row.codigo_grupo,
          campana: row.campana,
          fecha_registro_asistencia: isoDate,
          fecha_asistencia: isoDate,
          sigla: row.sigla,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
          estado: row.estado || 'ACTIVO',
          formador: row.nombre_formador,
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

    if (delErr) console.warn('Error borrando asistencias previas:', delErr.message);

    // 1. Agrupar bajas por motivo de baja para actualizar en lote por grupo de motivo
    const bajasByMotivo = new Map();
    for (const r of (records || []).filter(x => x.sigla === 'B' && x.documento)) {
      const motivo = r.motivo_baja || 'BAJA';
      const atrib = atribuirBaja(motivo);
      const obs = `${motivo} [${atrib}]`;
      if (!bajasByMotivo.has(obs)) {
        bajasByMotivo.set(obs, []);
      }
      bajasByMotivo.get(obs).push(r.documento);
    }

    // 2. Documentos a restaurar a ACTIVO (cualquiera que asista con sigla distinta de B)
    const activeDocs = (records || [])
      .filter(x => x.sigla !== 'B' && x.documento)
      .map(x => x.documento);

    // 3. Ejecutar updates de forma concurrente con Promise.all
    const updatePromises = [];

    for (const [obs, docs] of bajasByMotivo.entries()) {
      if (docs.length > 0) {
        updatePromises.push(
          supabase
            .from('nominas')
            .update({
              estado: 'BAJA',
              observacion_estado: obs,
              updated_at: new Date().toISOString(),
            })
            .in('documento', docs)
            .eq('activo', true)
        );
      }
    }

    if (activeDocs.length > 0) {
      updatePromises.push(
        supabase
          .from('nominas')
          .update({
            estado: 'ACTIVO',
            observacion_estado: null,
            updated_at: new Date().toISOString(),
          })
          .in('documento', activeDocs)
          .eq('activo', true)
          .in('estado', ['BAJA', 'CESADO', 'INACTIVO', 'DESERTO'])
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Invalidar caché para que la próxima lectura traiga datos frescos de Supabase
    invalidateCache('all_consolidado');
    invalidateCache('all_asistencias_bajas');
    invalidateCache('resumen_cap_');
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
    const { data: recRes, error: recErr } = await supabase
      .from('equipo_reclutamiento')
      .select('apellido_paterno, apellido_materno, nombres_completos')
      .eq('estado', 'ACTIVO')
      
    if (recErr) throw recErr

    const names = new Set()
    for (const r of recRes || []) {
      const full = `${r.apellido_paterno || ''} ${r.apellido_materno || ''} ${r.nombres_completos || ''}`.trim().replace(/\s+/g, ' ')
      if (full) names.add(full.toUpperCase())
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
    // Sync table with real recruiters
    const validNames = await fetchReclutadores()
    
    const { data: currentRecs } = await supabase.from('reclutadores').select('*')
    if (currentRecs) {
      const existingNames = new Set(currentRecs.map(r => (r.nombre_completo || '').trim().toUpperCase()))
      const missing = validNames.filter(n => !existingNames.has(n.toUpperCase()))
      
      if (missing.length > 0) {
        await supabase.from('reclutadores').insert(missing.map(n => ({ nombre_completo: n, activo: true })))
      }
      
      const garbageIds = currentRecs
        .filter(r => r.activo && !validNames.includes((r.nombre_completo || '').trim().toUpperCase()))
        .map(r => r.id)
        
      if (garbageIds.length > 0) {
        await supabase.from('reclutadores').update({ activo: false }).in('id', garbageIds)
      }
    }

    const { data, error } = await supabase
      .from('reclutadores')
      .select('id, nombre_completo, activo')
      .eq('activo', true)
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

export function fetchGruposConMetas() {
  return withCache('grupos_con_metas', 180000, async () => {
    if (DB_MODE === 'supabase') {
      // 1. Fetch groups and recruiters in parallel (consultando solo columnas necesarias de nominas activas)
      const [gruposRes, relRes, nominasRes, equipoRes, asisRes] = await Promise.all([
        supabase
          .from('capacidad_rys')
          .select('codigo, periodo, semana_label, estado, meta_dia_0, meta_dia_1, rq_solicitado, rq_ftes_solicitado, campana, segmento, modalidad, sede, rango_horario, fecha_registro, fecha_inicio_ojt, fecha_ingreso_op')
          .order('codigo'),
        supabase
          .from('grupo_reclutadores')
          .select('grupo_codigo, reclutador_id, meta_rq_individual, meta_dia_1_individual, reclutadores(nombre_completo)'),
        supabase
          .from('nominas')
          .select('documento, grupo_codigo, campana, reclutador_id, dia_0, dia_1, sede')
          .eq('activo', true),
        supabase
          .from('equipo_reclutamiento')
          .select('documento, alias, apellido_paterno, apellido_materno, nombres_completos')
          .eq('estado', 'ACTIVO'),
        supabase
          .from('consolidado_asistencias')
          .select('documento, motivo_baja, estado, codigo_grupo, campana')
          .limit(10000)
      ])

    if (gruposRes.error) throw gruposRes.error
    if (relRes.error) throw relRes.error
    if (nominasRes.error) throw nominasRes.error

    const equipoMap = {}
    for (const eq of (equipoRes.data || [])) {
      const full = `${eq.apellido_paterno || ''} ${eq.apellido_materno || ''} ${eq.nombres_completos || ''}`.trim().replace(/\s+/g, ' ').toUpperCase()
      equipoMap[full] = { documento: eq.documento, alias: eq.alias }
    }

    const relMap = {}
    for (const r of (relRes.data || [])) {
      if (!relMap[r.grupo_codigo]) relMap[r.grupo_codigo] = []
      const nomFull = (r.reclutadores?.nombre_completo || 'Desconocido').toUpperCase()
      const eqData = equipoMap[nomFull] || {}
      
      relMap[r.grupo_codigo].push({
        reclutador_id: r.reclutador_id,
        nombre_completo: r.reclutadores?.nombre_completo || 'Desconocido',
        documento: eqData.documento || null,
        alias: eqData.alias || null,
        meta_rq_individual: r.meta_rq_individual || 0,
        meta_dia_1_individual: r.meta_dia_1_individual || 0
      })
    }

    const nominas = nominasRes.data || []
    const asisData = asisRes.data || []
    
    // Group asistencias by group and doc
    const bajaDia1Set = new Set()
    for (const a of asisData) {
      const m = String(a.motivo_baja || '').toUpperCase()
      const e = String(a.estado || '').toUpperCase()
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1')) {
        bajaDia1Set.add(`${a.codigo_grupo}|${a.campana}|${a.documento}`)
      }
    }

    return (gruposRes.data || []).map(g => {
      const gCodigo = g.codigo || ''
      const gCampana = g.campana || ''
      const reclutadoresAsignados = relMap[gCodigo] || []
      
      // Filter nominas for this specific group + campaign
      const nominasGrupo = nominas.filter(n => n.grupo_codigo === gCodigo && n.campana === gCampana)

      // Get sede from capacidad_rys or fallback to most frequent sede in nominas
      let sede = (g.sede && g.sede.trim() && g.sede.trim() !== '-') ? g.sede.trim() : '-'
      if (sede === '-' && nominasGrupo.length > 0) {
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
      const conectadosDia1 = nominasGrupo.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${gCampana}|${n.documento}`)).length

      // Map over recruiters to add their individual counts
      const reclutadoresConStats = reclutadoresAsignados.map(r => {
        const nominasReclutador = nominasGrupo.filter(n => n.reclutador_id === r.reclutador_id)
        return {
          ...r,
          conteo_individual: nominasReclutador.length,
          conectados_dia_1_individual: nominasReclutador.filter(n => n.dia_1 === 'ASISTIO' && !bajaDia1Set.has(`${gCodigo}|${gCampana}|${n.documento}`)).length
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
        fecha_inicio_ojt: g.fecha_inicio_ojt || '',
        fecha_ingreso_op: g.fecha_ingreso_op || '',
        meta_dia_0_grupal: g.meta_dia_0 || 0,
        meta_dia_1_grupal: g.meta_dia_1 || 0,
        rq_solicitado: g.rq_solicitado || 0,
        rq_ftes_solicitado: g.rq_ftes_solicitado || 0,
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
  })
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
    invalidateCache('grupos_con_metas')
    return true
  }
  return true
}

export async function fetchFormadores() {
  if (DB_MODE === 'supabase') {
    const map = new Map()

    // 1. Fetch formadores
    try {
      const { data: formData } = await supabase
        .from('formadores')
        .select('documento, nombre_completo, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado')
        .order('nombre_completo')

      if (formData) {
        formData.forEach(f => {
          const doc = String(f.documento || '').trim()
          if (doc) {
            map.set(doc, {
              documento: doc,
              nombre_completo: (f.nombre_completo || '').trim().toUpperCase(),
              sede: f.sede || '',
              segmento: f.segmento || '',
              subcampana: f.subcampana || '',
              cargo_contractual: f.cargo_contractual || 'FORMADOR',
              cargo_funcional: (f.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
              estado: (f.estado || 'Activo').trim()
            })
          }
        })
      }
    } catch (e) {
      console.warn('fetch formadores table err:', e)
    }

    // 2. Fetch equipo_formacion (merge/complement)
    try {
      const { data: efData } = await supabase
        .from('equipo_formacion')
        .select('documento, apellido_paterno, apellido_materno, nombres_completos, datos_completos, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado')
        .order('nombres_completos')

      if (efData) {
        efData.forEach(f => {
          const doc = String(f.documento || '').trim()
          if (doc) {
            const existing = map.get(doc) || {}
            map.set(doc, {
              documento: doc,
              nombre_completo: (f.datos_completos || f.nombres_completos || existing.nombre_completo || '').trim().toUpperCase(),
              sede: f.sede || existing.sede || '',
              segmento: f.segmento || existing.segmento || '',
              subcampana: f.subcampana || existing.subcampana || '',
              cargo_contractual: f.cargo_contractual || existing.cargo_contractual || 'FORMADOR',
              cargo_funcional: (f.cargo_funcional || existing.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
              estado: (f.estado || existing.estado || 'Activo').trim()
            })
          }
        })
      }
    } catch (e) {
      console.warn('fetch equipo_formacion table err:', e)
    }

    if (map.size > 0) {
      return [...map.values()]
    }

    // Fallback: perfiles con rol formador si no hay registros
    const { data: perfilesData } = await supabase
      .from('perfiles_publico')
      .select('nombre, rol')
      .eq('rol', 'formador')
      .order('nombre')

    for (const p of perfilesData || []) {
      const doc = `USR-${(p.nombre || 'FORMADOR').replace(/\s+/g, '').slice(0, 12).toUpperCase()}`
      map.set(doc, { documento: doc, nombre_completo: p.nombre, estado: 'Activo' })
    }
    return [...map.values()]
  }
  // Local fallback
  const list = getFromStorage('formadores') || []
  return list.map(f => ({
    documento: f.documento,
    nombre_completo: f.nombre_completo || f.nombre,
    sede: f.sede || '',
    segmento: f.segmento || '',
    subcampana: f.subcampana || '',
    cargo_funcional: f.cargo_funcional || 'FORMADOR',
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
export function fetchMotivosBaja() {
  return withCache('motivos_baja', 600000, async () => {
    if (DB_MODE === 'supabase') {
      const { data, error } = await supabase.from('motivos_baja').select('motivo')
      if (error) throw error
      return data || []
    }
    initLocalStorageDb()
    return getFromStorage('motivos_baja') || []
  });
}

export async function insertMotivoBaja(payload) {
  if (DB_MODE === 'supabase') {
    const { data, error } = await supabase.from('motivos_baja').insert([payload]).select().single()
    if (error) throw error
    invalidateCache('motivos_baja')
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
    invalidateCache('motivos_baja')
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
    invalidateCache('motivos_baja')
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
    // QW-5: Lanzar error para que el llamador lo maneje sin bloquear el hilo con alert()
    throw new Error('Error guardando en base de datos: ' + error.message);
  }
  // Invalidar caché para que la próxima lectura traiga datos frescos de Supabase
  invalidateCache('all_consolidado');
  invalidateCache('all_asistencias_bajas');
  invalidateCache('all_motivos_bajas');
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
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, fecha_inicio_ojt, periodo, segmento, semana_label, semana_trabajo'),
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

export async function fetchMotivosBajasData() {
  if (DB_MODE !== 'supabase') return { consolidado: [], capacidades: [], nominas: [] };

  return withCache('all_motivos_bajas', 180000, async () => {
    const [consData, capRes, nominasRes] = await Promise.all([
      fetchAllConsolidado(),
      supabase.from('capacidad_rys').select('codigo, campana, meta_dia_1, rq_solicitado, fecha_inicio_ojt, periodo, segmento, semana_label, semana_trabajo'),
      supabase.from('nominas').select('documento, campana, grupo_codigo, fecha_inicio_capacitacion, estado, activo')
    ]);

    if (capRes.error) console.warn('Error fetching capacidad_rys in fetchMotivosBajasData:', capRes.error);
    if (nominasRes.error) console.warn('Error fetching nominas in fetchMotivosBajasData:', nominasRes.error);

    return {
      consolidado: consData || [],
      capacidades: capRes.data || [],
      nominas: nominasRes.data || []
    };
  });
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

export function fetchAllAsistenciasBajas() {
  return withCache('all_asistencias_bajas', 180000, async () => {
    if (DB_MODE !== 'supabase') return []
    
    let allData = [];
    let from = 0;
    const step = 2000;
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
  });
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
  
  const isoFecha = parseFechaAsistencia(fecha_dia1) || fecha_dia1;
  
  const { data: existing } = await supabase.from('grupos_dia1').select('grupo_codigo').eq('grupo_codigo', grupo_codigo).eq('campana', campana).limit(1).maybeSingle()
  
  if (existing) {
    const { error } = await supabase.from('grupos_dia1').update({
      fecha_dia1: isoFecha,
      estado_calibracion: 'PENDIENTE',
      updated_at: new Date().toISOString()
    }).eq('grupo_codigo', grupo_codigo).eq('campana', campana)
    if (error) throw error
  } else {
    const { error } = await supabase.from('grupos_dia1').insert({
      grupo_codigo,
      campana,
      fecha_dia1: isoFecha,
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
      .update({ estado: 'CESADO', activo: false, updated_at: new Date().toISOString() })
      .in('documento', bajas)
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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  const bajasDia1Set = new Set()
  for (const r of (rawFormAsis || [])) {
    const doc = r.documento || r.postulante_documento
    const m = String(r.motivo_baja || '').toUpperCase()
    const e = String(r.estado || '').toUpperCase()
    const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase()
    if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
      if (doc) bajasDia1Set.add(doc)
    }
  }

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else if (f.fecha_asistencia === fecha_dia1_ref) {
      mapFormFull.set(doc, f)
    }
  }

  if (!recAsis || recAsis.length === 0 || mapFormFull.size === 0 || !fecha_dia1_ref) {
    if (fecha_dia1_ref) {
      await supabase.from('grupos_dia1').upsert({
        grupo_codigo,
        campana,
        fecha_dia1: fecha_dia1_ref,
        estado_calibracion: 'PENDIENTE',
        updated_at: new Date().toISOString()
      }, { onConflict: 'campana,grupo_codigo' })
    } else {
      // Solo actualizar si el registro ya existe en grupos_dia1 para no violar not-null en fecha_dia1
      await supabase.from('grupos_dia1').update({
        estado_calibracion: 'PENDIENTE',
        updated_at: new Date().toISOString()
      }).eq('grupo_codigo', grupo_codigo).eq('campana', campana)
    }
    return 'PENDIENTE'
  }

  const mapRec = new Map(recAsis.map(r => [r.documento, r.dia_1]))
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  
  let isCalibrated = true
  let countRec = 0
  let countForm = 0
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc) // 'ASISTIO' or 'FALTA' or undefined

    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = bajasDia1Set.has(doc)
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    
    // Formador asistencia = A, FI, FJ, I-OP
    const isFormAsistencia = !isBajaDia1 && (effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP')
    const isRecAsistencia = recSigla ? (!isBajaDia1 && String(recSigla).toUpperCase().trim() === 'ASISTIO') : false
    
    if (isRecAsistencia) countRec++
    if (isFormAsistencia) countForm++

    if (isFormAsistencia !== isRecAsistencia) {
      isCalibrated = false
    }
  }
  
  let newState = 'PENDIENTE'
  if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
    newState = 'PENDIENTE'
  } else if (countRec !== countForm || !isCalibrated) {
    newState = 'DESCALIBRADO'
  } else if (isCalibrated && countRec === countForm && countRec > 0) {
    newState = 'CALIBRADO'
  } else {
    newState = 'PENDIENTE'
  }

  await supabase.from('grupos_dia1').upsert({
    grupo_codigo,
    campana,
    fecha_dia1: fecha_dia1_ref || new Date().toISOString().split('T')[0],
    estado_calibracion: newState,
    updated_at: new Date().toISOString()
  }, { onConflict: 'campana,grupo_codigo' })
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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).map(row => {
    let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      fecha_asistencia: isoDate
    }
  }).filter(f => f.fecha_asistencia)

  const bajasDia1Set = new Set()
  for (const r of (rawFormAsis || [])) {
    const doc = r.documento || r.postulante_documento
    const m = String(r.motivo_baja || '').toUpperCase()
    const e = String(r.estado || '').toUpperCase()
    const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase()
    if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
      if (doc) bajasDia1Set.add(doc)
    }
  }

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else if (f.fecha_asistencia === fecha_dia1_ref) {
      mapFormFull.set(doc, f)
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
    
    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = bajasDia1Set.has(doc)
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    
    const isFormAsistencia = !isBajaDia1 && (effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP')
    const isRecAsistencia = recSigla ? (!isBajaDia1 && String(recSigla).toUpperCase().trim() === 'ASISTIO') : false
    
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
    .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado')
    .eq('codigo_grupo', grupo_codigo)
    .eq('campana', campana)
    .order('created_at', { ascending: true })
    
  const formAsis = (rawFormAsis || []).filter(row => row.fecha_registro_asistencia).map(row => {
    return {
      postulante_documento: row.documento,
      sigla_asistencia: row.sigla,
      motivo_baja: row.motivo_baja,
      estado: row.estado,
      fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia)
    }
  })

  if (!recAsis) return []

  const mapNombres = new Map(recAsis.map(p => [p.documento, `${p.apellido_paterno || ''} ${p.apellido_materno || ''}, ${p.nombres || ''}`.trim()]))

  const bajasDia1Set = new Set()
  for (const r of (rawFormAsis || [])) {
    const doc = r.documento || r.postulante_documento
    const m = String(r.motivo_baja || '').toUpperCase()
    const e = String(r.estado || '').toUpperCase()
    const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase()
    if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
      if (doc) bajasDia1Set.add(doc)
    }
  }

  const mapFormFull = new Map()
  for (const f of formAsis) {
    const doc = f.postulante_documento
    if (!mapFormFull.has(doc)) {
      mapFormFull.set(doc, f)
    } else if (f.fecha_asistencia === fecha_dia1_ref) {
      mapFormFull.set(doc, f)
    }
  }

  const mapRec = new Map(recAsis.map(r => [r.documento, r.dia_1]))
  
  const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
  const discrepancias = []
  
  for (const doc of allDocs) {
    const formRecord = mapFormFull.get(doc)
    const recSigla = mapRec.get(doc)
    
    const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
    const isBajaDia1 = bajasDia1Set.has(doc)
    
    const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
    const displayFormSigla = isBajaDia1 ? 'BAJA DÍA 1' : formSigla;
    
    const isFormAsistencia = !isBajaDia1 && (effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP')
    const isRecAsistencia = recSigla ? (!isBajaDia1 && String(recSigla).toUpperCase().trim() === 'ASISTIO') : false;
    
    if (isFormAsistencia !== isRecAsistencia) {
      discrepancias.push({
        documento: doc,
        nombre: mapNombres.get(doc) || 'Desconocido',
        sigla_formador: displayFormSigla,
        sigla_reclutador: recSigla ? (isBajaDia1 ? 'BAJA DÍA 1' : String(recSigla).toUpperCase().trim()) : 'SIN REGISTRO'
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

/**
 * Convierte cualquier enlace de Google Sheets (normal del navegador o publicado)
 * en la URL exacta de exportación CSV para la pestaña activa (gid).
 */
export function normalizeGoogleSheetCsvUrl(rawUrl) {
  if (!rawUrl) return ''
  const url = String(rawUrl).trim()

  // 1. Si ya es una URL CSV directa
  if (url.includes('output=csv') || url.includes('format=csv')) return url

  // 2. Si es una URL publicada en la web (.../pubhtml...)
  if (url.includes('/pubhtml')) {
    return url.replace('/pubhtml', '/pub') + (url.includes('?') ? '&output=csv' : '?output=csv')
  }

  // 3. Si es una URL estándar de Google Sheets (/spreadsheets/d/DOC_ID/edit...)
  const docMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/)
  if (docMatch) {
    const docId = docMatch[1]
    const gidMatch = url.match(/gid=([0-9]+)/)
    const gid = gidMatch ? gidMatch[1] : '0'
    return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`
  }

  return url
}

/**
 * Lee un libro completo de Google Spreadsheet (todas sus hojas/pestañas) vía XLSX o CSV.
 * Devuelve la lista de nombres de pestañas y el workbook para poder cambiar de hoja al instante.
 */
function decodeGoogleSheetName(str) {
  if (!str) return ''
  try {
    return str
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim()
  } catch {
    return str.replace(/\\x20/g, ' ').replace(/\\'/g, "'").trim()
  }
}

export async function fetchGoogleSpreadsheetWorkbookData(rawUrl) {
  const url = String(rawUrl || '').trim()
  console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] URL recibida:', url)
  if (!url) throw new Error('Ingresa un enlace de Google Sheets válido.')

  // ── PRIORIDAD 0: Google Apps Script Web App API (JSON Instantáneo en Vivo) ──
  if (url.includes('script.google.com/macros/s/')) {
    try {
      let finalUrl = url.trim()
      if (!finalUrl.includes('token=')) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'token=GEA_SECURE_TOKEN_2026_x89aF29mKpL0v'
      }
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Consultando Web App API en vivo:', finalUrl)
      const resp = await fetch(finalUrl, { redirect: 'follow' })
      if (resp.ok) {
        const json = await resp.json()
        if (json.error) throw new Error(json.error)
        if (Array.isArray(json) && json.length > 0) {
          const headers = Object.keys(json[0])
          const matrix = [headers]
          json.forEach(item => {
            matrix.push(headers.map(h => (item[h] !== undefined && item[h] !== null ? item[h] : '')))
          })
          return {
            type: 'webapp_api',
            matrix,
            sheetNames: ['API en Vivo (Formulario)'],
            currentSheet: 'API en Vivo (Formulario)'
          }
        } else if (Array.isArray(json) && json.length === 0) {
          return {
            type: 'webapp_api',
            matrix: [],
            sheetNames: ['API en Vivo (Formulario)'],
            currentSheet: 'API en Vivo (Formulario)'
          }
        }
      }
    } catch (e) {
      console.warn('Error consumiendo Google Apps Script Web App API:', e)
      throw e
    }
  }

  const docMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/)
  const docId = docMatch ? docMatch[1] : null
  const gidMatch = url.match(/gid=([0-9]+)/)
  const requestedGid = gidMatch ? gidMatch[1] : '0'

  const isPublished = url.includes('/d/e/2PACX-') || url.includes('/pubhtml') || url.includes('/pub')
  console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] docId:', docId, 'requestedGid:', requestedGid, 'isPublished:', isPublished)

  // ── PRIORIDAD 1: Descargar libro completo en formato XLSX (Multi-Hoja Instantáneo) ──
  if (docId && docId !== 'e' && !isPublished) {
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=xlsx`
    try {
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Intentando descargar libro completo XLSX:', xlsxUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      const resp = await fetch(xlsxUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (resp.ok) {
        const buffer = await resp.arrayBuffer()
        console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] XLSX descargado con éxito:', buffer.byteLength, 'bytes')
        const workbook = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: true })
        const sheetNames = workbook.SheetNames || []
        if (sheetNames.length > 0) {
          console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestañas en libro XLSX:', sheetNames)
          return {
            type: 'workbook',
            workbook,
            sheetNames,
            docId
          }
        }
      }
    } catch (e) {
      console.warn('[POOL-PIPELINE] XLSX export fallback (probando pubhtml):', e)
    }
  }

  // ── PRIORIDAD 2: Scraping de pestañas desde /pubhtml o /htmlview ──────────
  const pubUrlsToTry = []
  if (isPublished) {
    pubUrlsToTry.push(url.includes('/pubhtml') ? url : url.replace(/\/pub.*/, '/pubhtml'))
  } else if (docId) {
    pubUrlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/pubhtml`)
    pubUrlsToTry.push(`https://docs.google.com/spreadsheets/d/${docId}/htmlview`)
  }

  for (const pubHtmlUrl of pubUrlsToTry) {
    try {
      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Intentando descargar pubhtml:', pubHtmlUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      const resp = await fetch(pubHtmlUrl, { signal: controller.signal })
      clearTimeout(timeoutId)

      console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] Status HTTP:', resp.status, resp.statusText)
      if (resp.ok) {
        const html = await resp.text()
        console.info('[POOL-PIPELINE] [ETAPA 1: FETCH] HTML descargado (longitud):', html.length, 'bytes')
        const sheetMap = {}
        const sheetNames = []

        // Intento 2.1: Regex de items.push con nombre completo decodificado
        const regexPush = /items\.push\(\{\s*name:\s*"([^"]+)",[\s\S]*?gid:\s*"([^"]+)"/g
        let match
        while ((match = regexPush.exec(html)) !== null) {
          const rawName = match[1]
          const name = decodeGoogleSheetName(rawName)
          const gid = match[2]
          if (name && gid && !sheetMap[name]) {
            sheetMap[name] = gid
            sheetNames.push(name)
          }
        }

        // Intento 2.2: Regex de botones de hojas <li id="sheet-button-...">
        if (sheetNames.length === 0) {
          const regexButtons = /<li[^>]*id="sheet-button-([^"]+)"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/g
          while ((match = regexButtons.exec(html)) !== null) {
            const gid = match[1]
            const name = decodeGoogleSheetName(match[2])
            if (name && gid && !sheetMap[name]) {
              sheetMap[name] = gid
              sheetNames.push(name)
            }
          }
        }

        console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestañas encontradas en pubhtml:', sheetNames, sheetMap)

        if (sheetNames.length > 0) {
          const targetName = (requestedGid && Object.keys(sheetMap).find(k => sheetMap[k] === requestedGid)) || sheetNames[0]
          const targetGid = sheetMap[targetName] || requestedGid || '0'
          console.info('[POOL-PIPELINE] [ETAPA 2: PARSEO PESTAÑAS] Pestaña objetivo inicial:', targetName, 'GID:', targetGid)

          let matrix = []
          try {
            const baseUrl = docId 
              ? `https://docs.google.com/spreadsheets/d/${docId}` 
              : url.replace(/(\/pubhtml|\/pub).*/, '')
            
            // Probar CSV por gviz y luego por pub
            const gvizUrl = docId ? `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${targetGid}` : null
            if (gvizUrl) {
              const gvizResp = await fetch(gvizUrl)
              if (gvizResp.ok) {
                const gvizText = await gvizResp.text()
                if (gvizText && !gvizText.includes('<!DOCTYPE html>')) {
                  matrix = parseCSV(gvizText)
                }
              }
            }
            if (matrix.length === 0) {
              const csvUrl = `${baseUrl}/pub?gid=${targetGid}&single=true&output=csv`
              const csvResp = await fetch(csvUrl)
              if (csvResp.ok) {
                const csvText = await csvResp.text()
                matrix = parseCSV(csvText)
              }
            }
          } catch (_) { /* fallback silencioso */ }

          return {
            type: 'published_sheets',
            baseUrl: docId ? `https://docs.google.com/spreadsheets/d/${docId}` : url.replace(/(\/pubhtml|\/pub).*/, ''),
            sheetMap,
            sheetNames,
            matrix,
            currentSheet: targetName,
            docId: docId || 'published_form'
          }
        }
      }
    } catch (e) {
      console.warn('Scraping pubhtml/htmlview fallback:', e)
    }
  }

  // ── PRIORIDAD 3: Google Visualization API CSV ────────────────────────────
  if (docId && docId !== 'e') {
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${requestedGid}`
      const gvizResp = await fetch(gvizUrl)
      if (gvizResp.ok) {
        const text = await gvizResp.text()
        if (text && text.trim().length > 0 && !text.includes('<!DOCTYPE html>')) {
          const matrix = parseCSV(text)
          return {
            type: 'csv',
            matrix,
            sheetNames: ['Hoja Seleccionada']
          }
        }
      }
    } catch (e) {
      console.warn('GVIZ export fallback:', e)
    }
  }

  // Estrategia 4: Exportación directa CSV
  const csvUrl = normalizeGoogleSheetCsvUrl(url)
  try {
    const response = await fetch(csvUrl)
    if (response.ok) {
      const text = await response.text()
      if (text && !text.includes('<!DOCTYPE html>')) {
        const matrix = parseCSV(text)
        return {
          type: 'csv',
          matrix,
          sheetNames: ['Hoja Principal']
        }
      }
    }
  } catch (e) {
    console.warn('Direct CSV export fallback:', e)
  }

  throw new Error('No se pudo conectar con el documento de Google Sheets. Verifica que el documento tenga permisos de "Cualquier persona con el enlace puede ser lector" en Google Drive o esté publicado en la web (Archivo > Compartir > Publicar en la web).')
}

/**
 * Parsea una matriz de filas (de cualquier hoja de Google Spreadsheet o Excel)
 * mapeando las 68 columnas estándar de GEA y Google Forms.
 */
export async function parseSheetMatrixCandidates(matrix, options = {}) {
  console.info('[POOL-PIPELINE] [ETAPA 3/4: MATRIZ CRUDA] Filas totales en matriz:', matrix?.length || 0)
  if (!matrix || matrix.length < 2) return []

  const { mapGoogleFormHeaders, parseGoogleFormRow } = await import('./nominaConsolidadoSchema.js')

  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const headerRow = matrix[i] || []
    if (headerRow.some(c => {
      const str = String(c || '').toUpperCase().trim()
      return str.includes('DNI') || str.includes('DOCUMENTO') || str.includes('NOMBRES') || str.includes('APELLIDO')
    })) {
      const colIdx = mapGoogleFormHeaders(headerRow)
      console.info('[POOL-PIPELINE] [ETAPA 4: MAPEO COLUMNAS] Fila encabezado detectada en índice:', i, 'Columnas mapeadas:', Object.keys(colIdx))
      const rows = []

      for (let j = i + 1; j < matrix.length; j++) {
        const row = matrix[j]
        if (!row || !row.some(c => String(c || '').trim() !== '')) continue

        // 1. Detección precisa de corte por encabezado de tabla secundaria (ej. "HORARIO ESPECIAL")
        const rowCells = row.map(c => String(c || '').toUpperCase().trim()).filter(Boolean)
        const isSecondaryHeader = rowCells.some(cell => 
          cell === 'HORARIO ESPECIAL' || 
          cell.startsWith('HORARIO ESPECIAL') || 
          cell === 'HORARIOS ESPECIALES' ||
          cell === 'SOLICITUDES DE HORARIO'
        )
        // Si es título de tabla secundaria y no tiene datos de postulante, cortar
        const hasDocInRow = rowCells.some(cell => {
          const c = cell.replace(/^['"`’‘“”\s]+|['"`’‘“”\s]+$/g, '')
          return /^\d{6,15}$/.test(c)
        })
        if (isSecondaryHeader && !hasDocInRow) {
          console.info('[POOL-PIPELINE] [ETAPA 4: SALTO] Saltando fila de tabla secundaria en índice:', j)
          continue
        }

        const parsed = parseGoogleFormRow(row, colIdx)
        if (parsed && parsed.documento) {
          // Filtrado y optimización: solo traer registros desde el 01/07/2026 en adelante
          if (options.limitLast2Months !== false) {
            // Fecha de corte solicitada: 01 de Julio de 2026 (mes 6 en JS 0-indexado)
            const cutoffTime = options.startDateCutoff 
              ? new Date(options.startDateCutoff).getTime() 
              : new Date(2026, 6, 1, 0, 0, 0).getTime()

            let isRecent = false
            if (parsed.marca_temporal) {
              const dt = new Date(parsed.marca_temporal)
              if (!isNaN(dt.getTime())) {
                if (dt.getTime() >= cutoffTime) {
                  isRecent = true
                }
              }
            } else if (parsed.periodo_reclutado) {
              const pStr = String(parsed.periodo_reclutado).replace(/\D/g, '')
              if (pStr.length >= 6) {
                const pNum = parseInt(pStr.substring(0, 6), 10)
                // 202607 = Julio 2026
                if (!isNaN(pNum) && pNum >= 202607) {
                  isRecent = true
                }
              }
            } else {
              // Si no tiene fecha explícita, se mantiene
              isRecent = true
            }

            if (!isRecent) {
              continue
            }
          }

          rows.push(parsed)
        }
      }

      // Ordenar los postulantes de los más recientes a los más antiguos
      rows.sort((a, b) => {
        const dateA = a.marca_temporal ? new Date(a.marca_temporal).getTime() : 0
        const dateB = b.marca_temporal ? new Date(b.marca_temporal).getTime() : 0
        return dateB - dateA
      })

      console.info('[POOL-PIPELINE] [ETAPA 5: RESULTADO PARSEO] Total postulantes válidos extraídos de la hoja:', rows.length)
      return rows
    }
  }
  console.warn('[POOL-PIPELINE] [ETAPA 4: MAPEO COLUMNAS] No se encontró ninguna fila de encabezado reconocible en las primeras 15 filas.')
  return []
}

export async function fetchGoogleFormsPool(url, sheetName = null) {
  try {
    const wbData = await fetchGoogleSpreadsheetWorkbookData(url)
    if (wbData.type === 'workbook') {
      const targetSheet = sheetName && wbData.sheetNames.includes(sheetName)
        ? sheetName 
        : wbData.sheetNames[0]
      const worksheet = wbData.workbook.Sheets[targetSheet]
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
      return await parseSheetMatrixCandidates(matrix)
    }
    return await parseSheetMatrixCandidates(wbData.matrix)
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

export function fetchAllDescuentosBI() {
  return withCache('all_descuentos_bi', 180000, async () => {
    if (DB_MODE !== 'supabase') return [];
    
    let allData = [];
    let from = 0;
    const step = 2000;
    let page = 0;
    const MAX_PAGES = 50;
    
    while (page++ < MAX_PAGES) {
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
  });
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
  
  invalidateCache('descuentos_set_global');
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

  invalidateCache('descuentos_set_global');
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

  invalidateCache('descuentos_set_global');
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

export function getEquipoReclutamiento() {
  return withCache('equipo_reclutamiento', 300000, async () => {
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
  });
}

function cleanReclutamientoPayload(payload) {
  const allowed = ['documento', 'alias', 'apellido_paterno', 'apellido_materno', 'nombres_completos', 'cargo', 'estado', 'fecha_ingreso', 'fecha_cese', 'bono', 'pct_efectivo', 'pct_sodexo', 'alix'];
  const res = {};
  allowed.forEach(k => {
    if (payload[k] !== undefined) {
      if ((k === 'fecha_ingreso' || k === 'fecha_cese') && payload[k] === '') {
        res[k] = null;
      } else if (k === 'documento' || k === 'alias' || k === 'apellido_paterno' || k === 'apellido_materno' || k === 'nombres_completos' || k === 'cargo' || k === 'alix') {
        res[k] = payload[k] ? String(payload[k]).trim() : null;
      } else {
        res[k] = payload[k];
      }
    }
  });
  return res;
}

export async function updateEquipoReclutamiento(documento, payload) {
  if (DB_MODE === 'supabase') {
    const cleaned = cleanReclutamientoPayload(payload);
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .update({ ...cleaned, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_reclutamiento:", error);
      throw error;
    }
    invalidateCache('equipo_reclutamiento');
    invalidateCache('reclutadores');
    return data;
  }
  return null;
}

export async function addEquipoReclutamiento(payload) {
  if (DB_MODE === 'supabase') {
    const cleaned = cleanReclutamientoPayload(payload);
    const { data, error } = await supabase
      .from('equipo_reclutamiento')
      .upsert([{ ...cleaned, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], { onConflict: 'documento' })
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_reclutamiento:", error);
      throw error;
    }
    invalidateCache('equipo_reclutamiento');
    invalidateCache('reclutadores');
    return data;
  }
  return null;
}


// ==========================================
// EQUIPO DE FORMACION
// ==========================================

export function getEquipoFormacion() {
  return withCache('equipo_formacion', 120000, async () => {
    if (DB_MODE === 'supabase') {
      const map = new Map();

      // 1. Fetch formadores
      try {
        const { data: formData } = await supabase
          .from('formadores')
          .select('documento, nombre_completo, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado, fecha_inicio, fecha_cese')
          .order('nombre_completo');

        if (formData) {
          formData.forEach(f => {
            const doc = String(f.documento || '').trim();
            if (doc) {
              map.set(doc, {
                documento: doc,
                nombres_completos: (f.nombre_completo || '').trim().toUpperCase(),
                datos_completos: (f.nombre_completo || '').trim().toUpperCase(),
                sede: f.sede || '',
                segmento: f.segmento || '',
                subcampana: f.subcampana || '',
                cargo_contractual: f.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || 'ACTIVO').trim().toUpperCase(),
                fecha_inicio: f.fecha_inicio || null,
                fecha_cese: f.fecha_cese || null
              });
            }
          });
        }
      } catch (e) {
        console.warn('getEquipoFormacion: error reading formadores:', e);
      }

      // 2. Fetch equipo_formacion (merge/overwrite)
      try {
        const { data, error } = await supabase
          .from('equipo_formacion')
          .select('documento, apellido_paterno, apellido_materno, nombres_completos, datos_completos, sede, segmento, subcampana, cargo_contractual, cargo_funcional, estado, fecha_inicio, fecha_cese, bono_bruto, usuario_alix')
          .order('nombres_completos');
          
        if (!error && data) {
          data.forEach(f => {
            const doc = String(f.documento || '').trim();
            if (doc) {
              const existing = map.get(doc) || {};
              map.set(doc, {
                ...f,
                documento: doc,
                nombres_completos: (f.datos_completos || f.nombres_completos || existing.nombres_completos || '').trim().toUpperCase(),
                datos_completos: (f.datos_completos || f.nombres_completos || existing.datos_completos || '').trim().toUpperCase(),
                sede: f.sede || existing.sede || '',
                segmento: f.segmento || existing.segmento || '',
                subcampana: f.subcampana || existing.subcampana || '',
                cargo_contractual: f.cargo_contractual || existing.cargo_contractual || 'FORMADOR',
                cargo_funcional: (f.cargo_funcional || existing.cargo_funcional || 'FORMADOR').trim().toUpperCase(),
                estado: (f.estado || existing.estado || 'ACTIVO').trim().toUpperCase()
              });
            }
          });
        }
      } catch (e) {
        console.warn('getEquipoFormacion: error reading equipo_formacion:', e);
      }

      if (map.size > 0) {
        return Array.from(map.values()).sort((a, b) => (a.nombres_completos || '').localeCompare(b.nombres_completos || ''));
      }
    }
    
    return [];
  });
}

export async function updateEquipoFormacion(documento, payload) {
  if (DB_MODE === 'supabase') {
    const cleanPayload = { ...payload }
    if (typeof cleanPayload.nombres_completos === 'string') cleanPayload.nombres_completos = cleanPayload.nombres_completos.trim().toUpperCase()
    if (typeof cleanPayload.cargo_funcional === 'string') cleanPayload.cargo_funcional = cleanPayload.cargo_funcional.trim().toUpperCase()
    if (typeof cleanPayload.estado === 'string') cleanPayload.estado = cleanPayload.estado.trim().toUpperCase()

    const { data, error } = await supabase
      .from('equipo_formacion')
      .update({ ...cleanPayload, updated_at: new Date().toISOString() })
      .eq('documento', documento)
      .select()
      .single();
    if (error) {
      console.error("Error updating equipo_formacion:", error);
      throw error;
    }
    invalidateCache('equipo_formacion');
    return data;
  }
  return null;
}

export async function addEquipoFormacion(payload) {
  if (DB_MODE === 'supabase') {
    const cleanPayload = { ...payload }
    if (typeof cleanPayload.nombres_completos === 'string') cleanPayload.nombres_completos = cleanPayload.nombres_completos.trim().toUpperCase()
    if (typeof cleanPayload.cargo_funcional === 'string') cleanPayload.cargo_funcional = cleanPayload.cargo_funcional.trim().toUpperCase()
    if (typeof cleanPayload.estado === 'string') cleanPayload.estado = cleanPayload.estado.trim().toUpperCase()

    const { data, error } = await supabase
      .from('equipo_formacion')
      .upsert([{ ...cleanPayload, updated_at: new Date().toISOString() }], { onConflict: 'documento' })
      .select()
      .single();
    if (error) {
      console.error("Error adding equipo_formacion:", error);
      throw error;
    }
    invalidateCache('equipo_formacion');
    return data;
  }
  return null;
}

// ==========================================
// ASIGNACION FORMADORES
// ==========================================

export async function updateGrupoFormador(grupo_codigo, campana, formador_documento) {
  if (DB_MODE === 'supabase') {
    const { error } = await supabase
      .from('capacidad_rys')
      .update({ formador_documento })
      .eq('codigo', grupo_codigo)
      .eq('campana', campana);
      
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

export async function updateGrupoCapacidadField(grupo_codigo, campana, field, value) {
  if (DB_MODE === 'supabase') {
    const query = supabase.from('capacidad_rys').update({ [field]: value || null }).eq('codigo', grupo_codigo);
    if (campana && campana !== 'Sin Campaña') query.eq('campana', campana);
    const { error } = await query;
      
    if (error) {
      console.error(`Error actualizando ${field} del grupo:`, error);
      throw error;
    }
    
    invalidateCache('grupos_con_metas');
    mockAuditLog('capacidad_rys', 'UPDATE', grupo_codigo, null, { [field]: value });
    return true;
  }
  return false;
}

export async function fetchPostulantesPorGrupo(grupo_codigo, campana) {
  if (DB_MODE === 'supabase') {
    try {
      let query = supabase
        .from('nominas')
        .select('documento, apellido_paterno, apellido_materno, nombres, celular, condicion, campana, grupo_codigo, estado')
        .eq('grupo_codigo', grupo_codigo)

      if (campana && campana !== 'Sin Campaña' && campana !== 'Todas') {
        query = query.eq('campana', campana)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error fetching postulantes por grupo:', error)
        throw error
      }
      return (data || []).map(p => ({
        ...p,
        nombres_completos: `${p.nombres || ''} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.trim()
      })).sort((a, b) => (a.nombres_completos || '').localeCompare(b.nombres_completos || ''))
    } catch (err) {
      console.error('fetchPostulantesPorGrupo error:', err)
      throw err
    }
  }
  return []
}

export async function dividirGrupoBulk({ parentCodigo, campana, distribucion }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")

  // 1. Intentar ejecutar mediante el RPC transaccional optimizado de Postgres
  const { data, error } = await supabase.rpc('dividir_grupo_transaccional', {
    p_parent_codigo: parentCodigo,
    p_campana: campana,
    p_distribucion: distribucion
  })

  if (!error) {
    invalidateCache('grupos_capacidad')
    invalidateCache('grupos_con_metas')
    invalidateCache('equipo_formacion')
    invalidateCache('consolidado_asistencias')
    invalidateCache('all_nominas')
    invalidateCache('nominas_dataset')
    mockAuditLog('nominas', 'SPLIT_GRUPO_RPC', parentCodigo, null, { campana, distribucion, resultado: data })
    return data
  }

  // 2. Fallback resiliente en cliente si el RPC aún no fue creado en Supabase
  console.warn("RPC dividir_grupo_transaccional no encontrado en base de datos, ejecutando división directa por cliente...", error)

  // Obtener metadata del grupo padre de capacidad_rys
  let parentCap = null
  try {
    const { data: capData } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', parentCodigo)
      .eq('campana', campana)
      .maybeSingle()
    parentCap = capData
  } catch (cErr) {
    console.warn("No se pudo obtener metadata de capacidad_rys para el padre:", cErr)
  }

  let totalNominasUpdated = 0

  for (const item of distribucion) {
    const { subgrupo, doc_formador, dnis } = item
    if (!dnis || dnis.length === 0) continue

    // A. Actualizar nóminas (solo grupo_codigo)
    try {
      const { error: nomErr } = await supabase
        .from('nominas')
        .update({ grupo_codigo: subgrupo, parent_grupo_codigo: parentCodigo })
        .in('documento', dnis)
        .eq('campana', campana)

      if (nomErr) {
        // Si parent_grupo_codigo no existe como columna, actualizar solo grupo_codigo
        await supabase
          .from('nominas')
          .update({ grupo_codigo: subgrupo })
          .in('documento', dnis)
          .eq('campana', campana)
      }
    } catch (nErr) {
      await supabase
        .from('nominas')
        .update({ grupo_codigo: subgrupo })
        .in('documento', dnis)
        .eq('campana', campana)
    }

    // B. Actualizar histórico en consolidado_asistencias
    try {
      const asisPayload = {
        codigo_grupo: subgrupo,
        parent_grupo_codigo: parentCodigo
      }
      if (doc_formador) asisPayload.documento_formador = doc_formador

      const { error: asisErr } = await supabase
        .from('consolidado_asistencias')
        .update(asisPayload)
        .in('documento', dnis)
        .eq('campana', campana)

      if (asisErr) {
        delete asisPayload.parent_grupo_codigo
        await supabase
          .from('consolidado_asistencias')
          .update(asisPayload)
          .in('documento', dnis)
          .eq('campana', campana)
      }
    } catch (aErr) {
      console.warn("Aviso actualizando consolidado_asistencias:", aErr)
    }

    // C. Crear / Actualizar subgrupo en capacidad_rys con su respectiva formadora
    try {
      const subgrupoCapRow = {
        codigo: subgrupo,
        campana: campana,
        periodo: parentCap?.periodo || null,
        segmento: parentCap?.segmento || null,
        modalidad: parentCap?.modalidad || 'PRESENCIAL',
        semana_label: parentCap?.semana_label || null,
        semana_trabajo: parentCap?.semana_trabajo || null,
        fecha_inicio_ojt: parentCap?.fecha_inicio_ojt || null,
        fecha_ingreso_op: parentCap?.fecha_ingreso_op || null,
        formador_documento: doc_formador || parentCap?.formador_documento || null,
        estado: parentCap?.estado || 'ACTIVO',
        observacion: `Subgrupo derivado de ${parentCodigo}`
      }
      await supabase.from('capacidad_rys').upsert(subgrupoCapRow, { onConflict: 'campana,codigo' })
    } catch (capUpsertErr) {
      console.warn("Aviso creando subgrupo en capacidad_rys:", capUpsertErr)
    }

    totalNominasUpdated += dnis.length
  }

  // Invalidar cachés operativas
  invalidateCache('grupos_capacidad')
  invalidateCache('grupos_con_metas')
  invalidateCache('equipo_formacion')
  invalidateCache('consolidado_asistencias')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  mockAuditLog('nominas', 'SPLIT_GRUPO_CLIENT', parentCodigo, null, { campana, distribucion })

  return {
    success: true,
    parent_codigo: parentCodigo,
    campana,
    total_postulantes_distribuidos: totalNominasUpdated
  }
}

/**
 * Adjudica postulantes desde el Pool/Bolsa al grupo destino de forma atómica y segura.
 * Desactiva procesos previos en otros grupos (sin DELETE para preservar métricas históricas)
 * e inserta el nuevo registro activo en nóminas.
 */
export async function adjudicarPostulantesPoolBulk({ targetGrupo, targetCampana, postulantes }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")
  if (!targetGrupo) throw new Error("El código del grupo destino es obligatorio")
  if (!postulantes || postulantes.length === 0) return { success: true, inserted: 0, updated: 0 }

  const cleanGrupo = String(targetGrupo).trim().toUpperCase()
  const cleanCampana = String(targetCampana || '').trim().toUpperCase()

  // 1. Intentar ejecutar mediante el RPC transaccional de PostgreSQL
  try {
    const { data, error } = await supabase.rpc('adjudicar_postulantes_pool', {
      p_target_grupo: cleanGrupo,
      p_target_campana: cleanCampana,
      p_postulantes: postulantes
    })

    if (!error && data) {
      invalidateCache('all_consolidado')
      invalidateCache('resumen_cap_')
      invalidateCache('grupos_con_metas')
      invalidateCache('all_asistencias_bajas')
      invalidateCache('all_nominas')
      invalidateCache('nominas_dataset')
      return data
    }
  } catch (rpcErr) {
    console.warn("RPC adjudicar_postulantes_pool no disponible, usando fallback cliente:", rpcErr)
  }

  // 2. Fallback resiliente en cliente si el RPC aún no fue desplegado en Supabase
  const docs = postulantes.map(p => String(p.documento || '').trim()).filter(Boolean)
  if (docs.length > 0) {
    try {
      await supabase
        .from('nominas')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .in('documento', docs)
        .neq('grupo_codigo', cleanGrupo)
    } catch (deactErr) {
      console.warn("Aviso al desactivar procesos anteriores en fallback:", deactErr)
    }
  }

  const { data: insData, error: insErr } = await supabase
    .from('nominas')
    .insert(postulantes)

  if (insErr) throw insErr

  invalidateCache('all_consolidado')
  invalidateCache('resumen_cap_')
  invalidateCache('grupos_con_metas')
  invalidateCache('all_asistencias_bajas')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  return {
    success: true,
    inserted: postulantes.length,
    updated: 0,
    grupo: cleanGrupo,
    campana: cleanCampana
  }
}

/**
 * Migra una lista de postulantes (DNI) de un grupo/subgrupo a otro nuevo dentro de la misma campaña.
 * Actualiza nóminas, asistencias e invalida cachés operativas.
 */
export async function migrarPostulantesEntreGrupos({ origenGrupoCodigo, destinoGrupoCodigo, campana, dnis, destinoFormadorDoc }) {
  if (DB_MODE !== 'supabase') throw new Error("Requiere conexión a Supabase")
  if (!destinoGrupoCodigo) throw new Error("El código del grupo destino es obligatorio")
  if (!dnis || dnis.length === 0) throw new Error("Debes proporcionar al menos un DNI para migrar")

  const cleanOrigen = origenGrupoCodigo ? String(origenGrupoCodigo).trim().toUpperCase() : null
  const cleanDestino = String(destinoGrupoCodigo).trim().toUpperCase()
  const cleanCampana = campana ? String(campana).trim().toUpperCase() : null

  // 1. Actualizar tabla nominas
  let nomQuery = supabase
    .from('nominas')
    .update({ 
      grupo_codigo: cleanDestino,
      updated_at: new Date().toISOString()
    })
    .in('documento', dnis)

  if (cleanCampana) nomQuery = nomQuery.ilike('campana', `%${cleanCampana}%`)
  if (cleanOrigen) nomQuery = nomQuery.eq('grupo_codigo', cleanOrigen)

  const { error: nomErr, count: nomCount } = await nomQuery
  if (nomErr) throw nomErr

  // 2. Actualizar consolidado_asistencias
  const asisPayload = {
    codigo_grupo: cleanDestino
  }
  if (destinoFormadorDoc) asisPayload.documento_formador = destinoFormadorDoc

  let asisQuery = supabase
    .from('consolidado_asistencias')
    .update(asisPayload)
    .in('documento', dnis)

  if (cleanCampana) asisQuery = asisQuery.ilike('campana', `%${cleanCampana}%`)
  try {
    await asisQuery
  } catch (e) {
    console.warn('Aviso al actualizar consolidado_asistencias en migración:', e)
  }

  // 3. Crear / asegurar registro del subgrupo destino en capacidad_rys si aún no existe
  try {
    const { data: existingCap } = await supabase
      .from('capacidad_rys')
      .select('*')
      .eq('codigo', cleanDestino)
      .maybeSingle()

    if (!existingCap && cleanOrigen) {
      const { data: parentCap } = await supabase
        .from('capacidad_rys')
        .select('*')
        .or(`codigo.eq.${cleanOrigen},codigo.eq.${cleanOrigen.split('-')[0]}`)
        .maybeSingle()

      if (parentCap) {
        await supabase.from('capacidad_rys').upsert({
          codigo: cleanDestino,
          campana: parentCap.campana || cleanCampana,
          periodo: parentCap.periodo || null,
          segmento: parentCap.segmento || null,
          modalidad: parentCap.modalidad || 'PRESENCIAL',
          semana_label: parentCap.semana_label || null,
          semana_trabajo: parentCap.semana_trabajo || null,
          fecha_inicio_ojt: parentCap.fecha_inicio_ojt || null,
          fecha_ingreso_op: parentCap.fecha_ingreso_op || null,
          formador_documento: destinoFormadorDoc || parentCap.formador_documento || null,
          estado: 'ACTIVO',
          observacion: `Derivado de migración desde ${cleanOrigen}`
        }, { onConflict: 'campana,codigo' })
      }
    }
  } catch (capErr) {
    console.warn("Aviso asegurando subgrupo en capacidad_rys:", capErr)
  }

  // 4. Invalidar todas las cachés
  invalidateCache('all_consolidado')
  invalidateCache('all_asistencias_bajas')
  invalidateCache('all_motivos_bajas')
  invalidateCache('grupos_capacidad')
  invalidateCache('grupos_con_metas')
  invalidateCache('resumen_cap_')
  invalidateCache('all_nominas')
  invalidateCache('nominas_dataset')

  mockAuditLog('nominas', 'MIGRATE_POSTULANTES_GRUPO', cleanDestino, null, {
    origen: cleanOrigen,
    destino: cleanDestino,
    campana: cleanCampana,
    total_dnis: dnis.length,
    dnis
  })

  return {
    success: true,
    origen: cleanOrigen,
    destino: cleanDestino,
    total_migrados: dnis.length
  }
}


/**
 * Cálculo Ultrarrápido de Métricas de Calibración Día 1 en Memoria (O(1) Map indexing).
 * Reutiliza postulantes y asistencias ya cargados en RAM sin repaginar Supabase.
 */
export async function calculateMetricasReporteCalibracionFast(gruposInfo, postulantes = [], asistencias = []) {
  if (!gruposInfo || gruposInfo.length === 0) return []

  const norm = (val) => String(val || '').trim().toUpperCase();
  const codigos = [...new Set(gruposInfo.map(g => g.codigo).filter(Boolean))];
  const campanas = [...new Set(gruposInfo.map(g => g.campana).filter(Boolean))];

  // 1. Consultas de configuración y asistencias_dia1_reclutador
  let configAll = [];
  let recAsisDia1All = [];

  if (DB_MODE === 'supabase' && codigos.length > 0) {
    const [cfgRes, recAsisRes] = await Promise.all([
      supabase.from('grupos_dia1')
        .select('estado_calibracion, fecha_dia1, grupo_codigo, campana')
        .in('grupo_codigo', codigos),
      supabase.from('asistencias_dia1_reclutador')
        .select('postulante_documento, grupo_codigo, campana, sigla_inicial, sigla_final, motivo_baja')
        .in('grupo_codigo', codigos)
    ]);
    
    configAll = cfgRes.data || [];
    recAsisDia1All = recAsisRes.data || [];
  }

  const descSet = await getDescuentosSetGlobal();

  const configMap = new Map();
  if (configAll) {
    configAll.forEach(c => {
      const code = norm(c.grupo_codigo);
      configMap.set(`${norm(c.campana)}|${code}`, c);
      if (code) configMap.set(code, c);
    });
  }

  // Indexar asistencias_dia1_reclutador
  const recAsisMap = new Map();
  if (recAsisDia1All) {
    recAsisDia1All.forEach(r => {
      const code = norm(r.grupo_codigo);
      const doc = norm(r.postulante_documento);
      if (code && doc) {
        recAsisMap.set(`${code}|${doc}`, r);
        recAsisMap.set(`${norm(r.campana)}|${code}|${doc}`, r);
      }
    });
  }

  // 2. Indexación Dual O(1) de Nóminas / Postulantes en memoria
  const nominasGrouped = new Map();
  const nominasByCode = new Map();
  (postulantes || []).forEach(n => {
    const code = norm(n.grupo_codigo);
    const key = `${norm(n.campana)}|${code}`;
    if (!nominasGrouped.has(key)) nominasGrouped.set(key, []);
    nominasGrouped.get(key).push(n);

    if (code) {
      if (!nominasByCode.has(code)) nominasByCode.set(code, []);
      nominasByCode.get(code).push(n);
    }
  });

  // 3. Indexación Dual O(1) de Asistencias en memoria
  const formAsisGrouped = new Map();
  const formAsisByCode = new Map();
  (asistencias || []).forEach(f => {
    const code = norm(f.grupo_codigo || f.codigo_grupo);
    const key = `${norm(f.campana)}|${code}`;
    if (!formAsisGrouped.has(key)) formAsisGrouped.set(key, []);
    formAsisGrouped.get(key).push(f);

    if (code) {
      if (!formAsisByCode.has(code)) formAsisByCode.set(code, []);
      formAsisByCode.get(code).push(f);
    }
  });

  const isAsistioStr = (val) => {
    if (!val) return false;
    const s = norm(val);
    return s === 'ASISTIO' || s === 'ASISTIÓ' || s === 'A' || s === 'SI' || s === 'PRESENTE' || s === 'AGREGADO' || s === 'RECUPERADO';
  };

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana } = grupoInfo;
    const cleanCode = norm(grupo_codigo);
    const groupKey = `${norm(campana)}|${cleanCode}`;
    
    let totalNomina = 0;
    let totalDia0 = 0;
    let countRec = 0;
    
    const rawNominas = nominasGrouped.get(groupKey) || nominasByCode.get(cleanCode) || [];
    const validNominas = descSet.size > 0 
      ? rawNominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : rawNominas;
      
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || formAsisByCode.get(cleanCode) || [];

    // Fallback: Si no hay nóminas pero hay asistencias en el consolidado histórico
    let effectiveCandidates = validNominas;
    if (effectiveCandidates.length === 0 && groupFormAsisRaw.length > 0) {
      const seenDocs = new Map();
      groupFormAsisRaw.forEach(r => {
        const doc = r.documento || r.postulante_documento;
        if (doc && !seenDocs.has(doc)) {
          seenDocs.set(doc, {
            documento: doc,
            dia_0: 'ASISTIO',
            dia_1: 'ASISTIO'
          });
        }
      });
      effectiveCandidates = Array.from(seenDocs.values());
    }

    totalNomina = effectiveCandidates.length;
    totalDia0 = effectiveCandidates.filter(n => isAsistioStr(n.dia_0)).length;

    const bajasDia1Set = new Set();
    for (const r of groupFormAsisRaw) {
      const doc = r.documento || r.postulante_documento;
      const m = String(r.motivo_baja || '').toUpperCase();
      const e = String(r.estado || '').toUpperCase();
      const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase();
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
        if (doc) bajasDia1Set.add(doc);
      }
    }

    for (const n of effectiveCandidates) {
      const doc = norm(n.documento);
      const isBajaDia1 = bajasDia1Set.has(doc);
      const recAsisItem = recAsisMap.get(`${cleanCode}|${doc}`) || recAsisMap.get(`${norm(campana)}|${cleanCode}|${doc}`);
      
      const hasNominaDia1 = isAsistioStr(n.dia_1);
      const hasRecAsisDia1 = recAsisItem && (recAsisItem.sigla_inicial === 'A' || recAsisItem.sigla_final === 'A');

      if ((hasNominaDia1 || hasRecAsisDia1) && !isBajaDia1) {
        countRec++;
      }
    }

    const config = configMap.get(groupKey) || configMap.get(cleanCode);
    let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';
    let fecha_dia1_ref = config?.fecha_dia1 || null;

    if (!fecha_dia1_ref && groupFormAsisRaw.length > 0) {
       let earliestIso = null;
       
       for (const row of groupFormAsisRaw) {
         const dateVal = row.fecha_registro_asistencia || row.fecha_asistencia;
         if (dateVal) {
            const iso = parseFechaAsistencia(dateVal);
            if (iso && (!earliestIso || iso < earliestIso)) {
              earliestIso = iso;
            }
         }
       }
       fecha_dia1_ref = earliestIso;
    }

    let countForm = 0;
    if (fecha_dia1_ref) {
      const formAsis = groupFormAsisRaw
        .filter(f => (f.fecha_registro_asistencia || f.fecha_asistencia))
        .map(row => {
          return {
            postulante_documento: row.documento || row.postulante_documento,
            sigla_asistencia: row.sigla || row.sigla_asistencia,
            motivo_baja: row.motivo_baja,
            estado: row.estado,
            fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia || row.fecha_asistencia)
          }
        });

      const mapFormFull = new Map();
      for (const f of formAsis) {
        const doc = norm(f.postulante_documento);
        if (!mapFormFull.has(doc)) {
          mapFormFull.set(doc, f);
        } else if (f.fecha_asistencia === fecha_dia1_ref) {
          mapFormFull.set(doc, f);
        }
      }

      const mapRec = new Map(effectiveCandidates.map(r => [norm(r.documento), r.dia_1]))
      const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
      let isCalibrated = true
      for (const doc of allDocs) {
        const formRecord = mapFormFull.get(doc)
        const recSigla = mapRec.get(doc)
        const recAsisItem = recAsisMap.get(`${cleanCode}|${doc}`) || recAsisMap.get(`${norm(campana)}|${cleanCode}|${doc}`)
        
        const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
        const isBajaDia1 = bajasDia1Set.has(doc);
        const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
        
        const isFormAsistencia = !isBajaDia1 && (effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP' || effectiveFormSigla === 'CAPACITACION' || effectiveFormSigla === 'OJT');
        const isRecAsistencia = (!isBajaDia1) && (isAsistioStr(recSigla) || (recAsisItem && (recAsisItem.sigla_inicial === 'A' || recAsisItem.sigla_final === 'A')));
        
        if (isFormAsistencia) countForm++;

        if (isFormAsistencia !== isRecAsistencia) {
          isCalibrated = false
        }
      }

      if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
        estado_calibracion = 'PENDIENTE';
      } else if (countRec !== countForm || !isCalibrated) {
        estado_calibracion = 'DESCALIBRADO';
      } else if (countRec > 0 && countForm > 0 && isCalibrated && countRec === countForm) {
        estado_calibracion = 'CALIBRADO';
      } else {
        estado_calibracion = 'PENDIENTE';
      }
    } else {
      estado_calibracion = countRec > 0 ? 'DESCALIBRADO' : 'PENDIENTE';
    }

    results.push({
      grupo_codigo: grupo_codigo,
      campana: campana || '',
      segmento: grupoInfo.segmento || '',
      periodo: grupoInfo.periodo ? String(grupoInfo.periodo).trim() : '',
      semana_label: grupoInfo.semana_label ? String(grupoInfo.semana_label).trim() : '',
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

/**
 * Cálculo Ultrarrápido de Métricas de Resumen Capacitación en Memoria (O(1) Map indexing).
 * Reutiliza postulantes y asistencias ya cargados en RAM sin consultas redundantes a Supabase.
 */
export async function calculateMetricasResumenCapacitacionFast(gruposInfo, postulantes = [], asistencias = []) {
  if (!gruposInfo || gruposInfo.length === 0) return [];

  const norm = (val) => String(val || '').trim().toUpperCase();
  const descSet = await getDescuentosSetGlobal();

  const nominasGrouped = new Map();
  const nominasByCode = new Map();
  (postulantes || []).forEach(n => {
    const code = norm(n.grupo_codigo);
    const key = `${norm(n.campana)}|${code}`;
    if (!nominasGrouped.has(key)) nominasGrouped.set(key, []);
    nominasGrouped.get(key).push(n);

    if (code) {
      if (!nominasByCode.has(code)) nominasByCode.set(code, []);
      nominasByCode.get(code).push(n);
    }
  });

  const formAsisGrouped = new Map();
  const formAsisByCode = new Map();
  (asistencias || []).forEach(f => {
    const code = norm(f.grupo_codigo || f.codigo_grupo);
    const key = `${norm(f.campana)}|${code}`;
    if (!formAsisGrouped.has(key)) formAsisGrouped.set(key, []);
    formAsisGrouped.get(key).push(f);

    if (code) {
      if (!formAsisByCode.has(code)) formAsisByCode.set(code, []);
      formAsisByCode.get(code).push(f);
    }
  });

  const results = [];
  for (const grupoInfo of gruposInfo) {
    const { codigo: grupo_codigo, campana, fecha_inicio_ojt } = grupoInfo;
    const cleanCode = norm(grupo_codigo);
    const groupKey = `${norm(campana)}|${cleanCode}`;
    
    // Obtener nóminas intentando match exacto y luego por código de cohorte
    const rawNominas = nominasGrouped.get(groupKey) || nominasByCode.get(cleanCode) || [];
    const validNominas = descSet.size > 0 
      ? rawNominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : rawNominas;
      
    // Obtener asistencias intentando match exacto y luego por código de cohorte
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || formAsisByCode.get(cleanCode) || [];

    // Fallback: Si no hay nóminas pero hay asistencias en el consolidado histórico
    let effectiveCandidates = validNominas;
    if (effectiveCandidates.length === 0 && groupFormAsisRaw.length > 0) {
      const seenDocs = new Map();
      groupFormAsisRaw.forEach(r => {
        const doc = r.documento || r.postulante_documento;
        if (doc && !seenDocs.has(doc)) {
          seenDocs.set(doc, {
            documento: doc,
            dia_0: 'ASISTIO',
            dia_1: 'ASISTIO'
          });
        }
      });
      effectiveCandidates = Array.from(seenDocs.values());
    }

    const total_nomina = effectiveCandidates.length;

    let asistio_dia0 = 0;
    let asistio_dia1 = 0;

    for (const n of effectiveCandidates) {
      const doc = n.documento;
      const records = groupFormAsisRaw.filter(r => (r.documento || r.postulante_documento) === doc);
      const tieneIngreso = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        const st = String(r.estado || '').toUpperCase().trim();
        return s === 'I-OP' || st.includes('INGRESO') || st.includes('OP') || st.includes('APROBADO');
      });

      const d0 = String(n.dia_0 || '').toUpperCase().trim();
      const hasD0Attendance = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'F' || s === 'B' || s === 'I-OP' || s === 'CAPACITACION' || s === 'OJT';
      });
      if (d0 === 'ASISTIO' || d0.includes('FALTA') || d0.includes('BAJA') || hasD0Attendance || tieneIngreso) {
        asistio_dia0++;
      }
      
      const d1 = String(n.dia_1 || '').toUpperCase().trim();
      const hasD1Nomina = Boolean(d1) && d1 !== 'NO' && d1 !== 'CANCELADO' && d1 !== 'DESCARTADO';
      const hasD1Attendance = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'F' || s === 'B' || s === 'I-OP' || s === 'CAPACITACION' || s === 'OJT';
      });

      if (d1 === 'ASISTIO' || d1.includes('FALTA') || d1.includes('BAJA') || hasD1Nomina || hasD1Attendance || tieneIngreso) {
        asistio_dia1++;
      }
    }

    const estadoGrupo = String(grupoInfo.estado || '').toUpperCase().trim();
    const periodoRys = String(grupoInfo.periodo_rys || '').toUpperCase().trim();
    const isGrupoCerrado = estadoGrupo === 'CERRADO' || estadoGrupo === 'CANCELADO' || estadoGrupo === 'FINALIZADO' || estadoGrupo === 'CULMINADO' || periodoRys === 'CANCELADO';

    let activos_actuales = 0;
    let activos_ojt = 0;
    let ingresos_iop = 0;

    for (const n of effectiveCandidates) {
      const doc = n.documento;
      const records = groupFormAsisRaw.filter(r => (r.documento || r.postulante_documento) === doc);
      
      // Tiene I-OP o pase formal a operación?
      const tieneIngreso = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        const st = String(r.estado || '').toUpperCase().trim();
        return s === 'I-OP' || st.includes('INGRESO') || st.includes('OP') || st.includes('APROBADO');
      });
      if (tieneIngreso) {
        ingresos_iop++;
      }

      const dia1Asistio = String(n.dia_1 || '').toUpperCase().trim() === 'ASISTIO' || records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'CAPACITACION' || s === 'OJT' || s === 'I-OP';
      }) || tieneIngreso;

      let isBajaDia1 = false;
      let isBajaGeneral = false;
      
      if (records.length > 0) {
        const sortedRecords = [...records].sort((a, b) => new Date(a.fecha_registro_asistencia || a.fecha_asistencia || 0) - new Date(b.fecha_registro_asistencia || b.fecha_asistencia || 0));
        const lastRecord = sortedRecords[sortedRecords.length - 1];
        
        const txtEstado = String(lastRecord.estado || '').toUpperCase();
        const txtMotivo = String(lastRecord.motivo_baja || '').toUpperCase();
        const txtSigla = String(lastRecord.sigla || lastRecord.sigla_asistencia || '').toUpperCase().trim();
        const txtObs = String(lastRecord.observacion_estado || '').toUpperCase();
        
        isBajaDia1 = txtMotivo.includes('BAJA DIA 1') || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
        isBajaGeneral = txtSigla === 'B' || txtMotivo.includes('BAJA') || txtEstado.includes('BAJA') || txtEstado === 'CESADO' || txtEstado === 'INACTIVO';
      }

      // Activo en OJT? (Cualquiera que haya llegado a I-OP, o que tenga asistencia >= fecha_inicio_ojt sin baja)
      let isOjtActive = false;
      if (tieneIngreso) {
        isOjtActive = true;
      } else if (dia1Asistio && !isBajaDia1) {
        if (fecha_inicio_ojt && fecha_inicio_ojt !== 'No definida') {
          const targetDateStr = parseFechaAsistencia(fecha_inicio_ojt);
          isOjtActive = records.some(r => {
            const rawDate = r.fecha_registro_asistencia || r.fecha_asistencia;
            if (!rawDate) return false;
            const recordDateStr = parseFechaAsistencia(rawDate);
            const sigla = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
            const estado = String(r.estado || '').toUpperCase().trim();
            const motivo = String(r.motivo_baja || '').toUpperCase().trim();
            const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado.includes('BAJA') || estado === 'CESADO' || estado === 'INACTIVO';
            return recordDateStr >= targetDateStr && !isBaja;
          });
        } else if (records.length > 1 && !isBajaGeneral) {
          isOjtActive = true;
        }
      }

      if (isOjtActive) {
        activos_ojt++;
      }

      // Activo Actual? (Postulantes que pasaron Día 1, no son baja, no han salido a I-OP, y el grupo sigue abierto)
      if (!isGrupoCerrado && dia1Asistio && !isBajaDia1 && !isBajaGeneral && !tieneIngreso) {
        activos_actuales++;
      }
    }

    // Formador a cargo de la cohorte
    let formador = String(grupoInfo.formador || grupoInfo.nombre_formador || grupoInfo.usuario_formador || '').trim();
    if (!formador && groupFormAsisRaw.length > 0) {
      const rec = groupFormAsisRaw.find(r => r.nombre_formador || r.formador || r.usuario_formador);
      if (rec) {
        formador = String(rec.nombre_formador || rec.formador || rec.usuario_formador || '').trim();
      }
    }

    // Fecha más reciente en que se guardó asistencia
    let ultima_fecha_asistencia = '';
    if (groupFormAsisRaw.length > 0) {
      const validDates = groupFormAsisRaw
        .map(r => r.fecha_registro_asistencia || r.fecha_asistencia || r.fecha || '')
        .filter(f => Boolean(f) && String(f).trim() !== '')
        .map(f => {
          const str = String(f).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
          const parts = str.split(/[\/\-]/);
          if (parts.length === 3 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
          const dt = new Date(str);
          return isNaN(dt.getTime()) ? str : dt.toISOString().slice(0, 10);
        })
        .filter(Boolean)
        .sort();
      if (validDates.length > 0) {
        ultima_fecha_asistencia = validDates[validDates.length - 1];
      }
    }

    results.push({
      grupo_codigo,
      campana: campana || '',
      formador: formador || 'Sin Asignar',
      ultima_fecha_asistencia: ultima_fecha_asistencia || '-',
      periodo: grupoInfo.periodo ? String(grupoInfo.periodo).trim() : '',
      semana: grupoInfo.semana_trabajo || grupoInfo.semana_label || grupoInfo.semana || '',
      segmento: grupoInfo.segmento || '',
      estado: estadoGrupo || 'EN CURSO',
      is_cerrado: isGrupoCerrado,
      modalidad: (grupoInfo.modalidad || 'PRESENCIAL').toUpperCase().trim(),
      fecha_inicio_ojt: fecha_inicio_ojt || 'No definida',
      requerimiento: parseInt(grupoInfo.rq_solicitado || grupoInfo.meta || grupoInfo.requerimiento || 0) || total_nomina || 0,
      rq_solicitado: parseInt(grupoInfo.rq_solicitado || grupoInfo.meta || 0) || 0,
      total_nomina,
      asistio_dia0,
      asistio_dia1,
      activos_actuales,
      activos_ojt,
      ingresos_iop,
      asistencias_raw: groupFormAsisRaw || []
    });
  }

  return results;
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
      .select('documento, fecha_registro_asistencia, sigla, motivo_baja, estado, codigo_grupo, campana')
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
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || [];

    const bajasDia1Set = new Set();
    for (const r of groupFormAsisRaw) {
      const doc = r.documento || r.postulante_documento;
      const m = String(r.motivo_baja || '').toUpperCase();
      const e = String(r.estado || '').toUpperCase();
      const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase();
      if (m.includes('BAJA DIA 1') || e.includes('BAJA DIA 1') || (s === 'B' && m.includes('BAJA'))) {
        if (doc) bajasDia1Set.add(doc);
      }
    }

    for (const n of validNominas) {
      if (String(n.dia_1).toUpperCase().trim() === 'ASISTIO') {
        const isBajaDia1 = bajasDia1Set.has(n.documento);
        if (!isBajaDia1) {
          countRec++;
        }
      }
    }

    const config = configMap.get(groupKey);
    let estado_calibracion = config?.estado_calibracion || 'PENDIENTE';
    let fecha_dia1_ref = config?.fecha_dia1 || null;

    if (!fecha_dia1_ref && groupFormAsisRaw.length > 0) {
       let earliestIso = null;
       
       for (const row of groupFormAsisRaw) {
         if (row.fecha_registro_asistencia) {
            const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
            if (iso && (!earliestIso || iso < earliestIso)) {
              earliestIso = iso;
            }
         }
       }
       fecha_dia1_ref = earliestIso;
    }

    let countForm = 0;
    if (fecha_dia1_ref) {
      const formAsis = groupFormAsisRaw.filter(f => f.fecha_registro_asistencia).map(row => {
        return {
          postulante_documento: row.documento,
          sigla_asistencia: row.sigla,
          motivo_baja: row.motivo_baja,
          estado: row.estado,
          fecha_asistencia: parseFechaAsistencia(row.fecha_registro_asistencia)
        }
      });

      const mapFormFull = new Map();
      for (const f of formAsis) {
        const doc = f.postulante_documento;
        if (!mapFormFull.has(doc)) {
          mapFormFull.set(doc, f);
        } else if (f.fecha_asistencia === fecha_dia1_ref) {
          mapFormFull.set(doc, f);
        }
      }

      const mapRec = new Map(validNominas.map(r => [r.documento, r.dia_1]))
      const allDocs = new Set([...mapFormFull.keys(), ...mapRec.keys()])
      let isCalibrated = true
      for (const doc of allDocs) {
        const formRecord = mapFormFull.get(doc)
        const recSigla = mapRec.get(doc) 
        
        const formSigla = formRecord ? formRecord.sigla_asistencia : 'Sin registro'
        const isBajaDia1 = bajasDia1Set.has(doc);
        const effectiveFormSigla = isBajaDia1 ? 'Sin registro' : formSigla;
        
        const isFormAsistencia = !isBajaDia1 && (effectiveFormSigla === 'A' || effectiveFormSigla === 'FI' || effectiveFormSigla === 'FJ' || effectiveFormSigla === 'I-OP');
        const isRecAsistencia = recSigla ? (!isBajaDia1 && String(recSigla).toUpperCase().trim() === 'ASISTIO') : false;
        
        if (isFormAsistencia) countForm++;

        if (isFormAsistencia !== isRecAsistencia) {
          isCalibrated = false
        }
      }

      if (!fecha_dia1_ref || (countRec === 0 && countForm === 0)) {
        estado_calibracion = 'PENDIENTE';
      } else if (countRec !== countForm || !isCalibrated) {
        estado_calibracion = 'DESCALIBRADO';
      } else if (countRec > 0 && countForm > 0 && isCalibrated && countRec === countForm) {
        estado_calibracion = 'CALIBRADO';
      } else {
        estado_calibracion = 'PENDIENTE';
      }
    } else {
      estado_calibracion = countRec > 0 ? 'DESCALIBRADO' : 'PENDIENTE';
    }

    results.push({
      grupo_codigo: grupo_codigo,
      campana: campana || '',
      segmento: grupoInfo.segmento || '',
      periodo: grupoInfo.periodo ? String(grupoInfo.periodo).trim() : '',
      semana_label: grupoInfo.semana_label ? String(grupoInfo.semana_label).trim() : '',
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

export async function getMetricasResumenCapacitacion(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return [];
  
  // QW-4: Cache dinámico por conjunto de grupos consultados (TTL: 3 min)
  const cacheKey = 'resumen_cap_' + [...new Set(gruposInfo.map(g => `${g.campana || ''}_${g.codigo || ''}`))].sort().join(',');

  return withCache(cacheKey, 180000, async () => {
    const codigos = [...new Set(gruposInfo.map(g => g.codigo))];
    const campanas = [...new Set(gruposInfo.map(g => g.campana))];

    // Set de pares (campana|codigo) válidos para filtrar combinaciones cartesianas
    const validPairs = new Set(gruposInfo.map(g => `${g.campana || ''}|${g.codigo || ''}`));

    // Parallel fetch for ultra-fast response (<500ms instead of 5-6s)
    const [nominasAll, formAsisAll, descSet] = await Promise.all([
      (async () => {
        let all = [];
        let from = 0;
        const step = 5000;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase.from('nominas')
            .select('documento, dia_0, dia_1, activo, grupo_codigo, campana')
            .in('grupo_codigo', codigos)
            .in('campana', campanas)
            .range(from, from + step - 1);
          if (data && data.length > 0) {
            const filtered = data.filter(n => validPairs.has(`${n.campana || ''}|${n.grupo_codigo || ''}`));
            all = all.concat(filtered);
            if (data.length < step) hasMore = false;
            else from += step;
          } else hasMore = false;
        }
        return all;
      })(),
      (async () => {
        let all = [];
        let from = 0;
        const step = 5000;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase.from('consolidado_asistencias')
            .select('documento, fecha_registro_asistencia, sigla, motivo_baja, codigo_grupo, campana, estado')
            .in('codigo_grupo', codigos)
            .in('campana', campanas)
            .range(from, from + step - 1);
          if (data && data.length > 0) {
            const filtered = data.filter(f => validPairs.has(`${f.campana || ''}|${f.codigo_grupo || ''}`));
            all = all.concat(filtered);
            if (data.length < step) hasMore = false;
            else from += step;
          } else hasMore = false;
        }
        return all;
      })(),
      getDescuentosSetGlobal()
    ]);

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
    const { codigo: grupo_codigo, campana, fecha_inicio_ojt } = grupoInfo;
    const groupKey = `${campana}|${grupo_codigo}`;
    
    const nominas = nominasGrouped.get(groupKey) || [];
    const validNominas = descSet.size > 0 
      ? nominas.filter(n => !descSet.has(makeDescuentoKey(n.documento, campana, grupo_codigo)))
      : nominas;
      
    const total_nomina = validNominas.length;
    const groupFormAsisRaw = formAsisGrouped.get(groupKey) || [];

    let asistio_dia0 = 0;
    let asistio_dia1 = 0;

    for (const n of validNominas) {
      const doc = n.documento;
      const records = groupFormAsisRaw.filter(r => (r.documento || r.postulante_documento) === doc);
      const tieneIngreso = records.some(r => String(r.sigla || r.sigla_asistencia).toUpperCase().trim() === 'I-OP');

      const d0 = String(n.dia_0 || '').toUpperCase().trim();
      if (d0 === 'ASISTIO' || d0.includes('FALTA') || d0.includes('BAJA') || tieneIngreso) {
        asistio_dia0++;
      }

      const d1 = String(n.dia_1 || '').toUpperCase().trim();
      const hasD1Nomina = Boolean(d1) && d1 !== 'NO' && d1 !== 'CANCELADO' && d1 !== 'DESCARTADO';
      const hasD1Attendance = records.some(r => {
        const s = String(r.sigla || r.sigla_asistencia || '').toUpperCase().trim();
        return s === 'A' || s === 'F' || s === 'B' || s === 'I-OP' || s === 'CAPACITACION';
      });

      if (d1 === 'ASISTIO' || d1.includes('FALTA') || d1.includes('BAJA') || hasD1Nomina || hasD1Attendance || tieneIngreso) {
        asistio_dia1++;
      }
    }

    const estadoGrupo = String(grupoInfo.estado || '').toUpperCase().trim();
    const periodoRys = String(grupoInfo.periodo_rys || '').toUpperCase().trim();
    const isGrupoCerrado = estadoGrupo === 'CERRADO' || estadoGrupo === 'CANCELADO' || estadoGrupo === 'FINALIZADO' || estadoGrupo === 'CULMINADO' || periodoRys === 'CANCELADO';

    let activos_actuales = 0;
    
    // Activos en OJT y Cantidad de Ingresos (I-OP)
    let activos_ojt = 0;
    let ingresos_iop = 0;

    const docs = [...new Set(validNominas.map(n => n.documento))];
    const targetOjtDate = fecha_inicio_ojt ? new Date(fecha_inicio_ojt).getTime() : null;

    for (const doc of docs) {
      const records = groupFormAsisRaw.filter(r => r.documento === doc);
      
      let currentState = '';
      let isBajaDia1 = false;
      if (records.length > 0) {
        const sortedRecords = [...records].sort((a, b) => new Date(a.fecha_registro_asistencia || 0) - new Date(b.fecha_registro_asistencia || 0));
        const lastRecord = sortedRecords[sortedRecords.length - 1];
        currentState = String(lastRecord.estado || '').toUpperCase();
        
        const txtEstado = String(lastRecord.estado || '').toUpperCase();
        const txtMotivo = String(lastRecord.motivo_baja || '').toUpperCase();
        const txtObs = String(lastRecord.observacion_estado || '').toUpperCase();
        
        isBajaDia1 = txtMotivo.includes('BAJA DIA 1') || txtEstado.includes('BAJA DIA 1') || txtObs.includes('BAJA DIA 1');
      }

      // Tiene I-OP?
      const tieneIngreso = records.some(r => String(r.sigla).toUpperCase().trim() === 'I-OP');
      if (tieneIngreso) {
        ingresos_iop++;
      }

      // Activo Actual? (Solo para grupos en curso/abiertos)
      if (!isGrupoCerrado) {
        if (records.length > 0 && currentState === 'ACTIVO' && !isBajaDia1 && !tieneIngreso) {
          activos_actuales++;
        }
      }

      // Activo en OJT?
      if (fecha_inicio_ojt) {
        const targetDateStr = parseFechaAsistencia(fecha_inicio_ojt);

        // Debe tener asistencia como ACTIVO únicamente en esa fecha específica de inicio OJT
        const wasActiveOnOjtDate = records.some(r => {
          if (!r.fecha_registro_asistencia) return false;
          const recordDateStr = parseFechaAsistencia(r.fecha_registro_asistencia);
          
          if (recordDateStr !== targetDateStr) return false;

          const sigla = String(r.sigla || '').toUpperCase().trim();
          const estado = String(r.estado || '').toUpperCase().trim();
          const motivo = String(r.motivo_baja || '').toUpperCase().trim();
          
          const isBaja = sigla === 'B' || motivo.includes('BAJA') || estado.includes('BAJA') || estado === 'CESADO' || estado === 'INACTIVO';
          return estado === 'ACTIVO' && !isBaja;
        });

        // Solo evaluamos su estado en esa fecha OJT y que no sea BAJA DIA 1
        if (wasActiveOnOjtDate && !isBajaDia1) {
          activos_ojt++;
        }
      } else {
        activos_ojt = 0; 
      }
    }

    results.push({
      grupo_codigo,
      campana: campana || '',
      periodo: grupoInfo.periodo || '',
      semana: grupoInfo.semana_trabajo || grupoInfo.semana_label || '',
      segmento: grupoInfo.segmento || '',
      estado: estadoGrupo || 'EN CURSO',
      is_cerrado: isGrupoCerrado,
      modalidad: (grupoInfo.modalidad || 'PRESENCIAL').toUpperCase().trim(),
      fecha_inicio_ojt: fecha_inicio_ojt || 'No definida',
      requerimiento: parseInt(grupoInfo.rq_solicitado || grupoInfo.meta || grupoInfo.requerimiento || 0) || total_nomina || 0,
      rq_solicitado: parseInt(grupoInfo.rq_solicitado || grupoInfo.meta || 0) || 0,
      total_nomina,
      asistio_dia0,
      asistio_dia1,
      activos_actuales,
      activos_ojt,
      ingresos_iop,
      asistencias_raw: groupFormAsisRaw || []
    });
  }

    return results;
  });
}

/**
 * Agrupa las métricas calculadas de grupos por modalidad (PRESENCIAL, REMOTO, HIBRIDO).
 * Reutiliza la misma lógica calibrada de getMetricasResumenCapacitacion.
 */
export function agruparMetricasPorModalidad(metricasGrupos) {
  const map = new Map();

  (metricasGrupos || []).forEach(g => {
    const mod = (g.modalidad || 'PRESENCIAL').toUpperCase().trim();
    if (!map.has(mod)) {
      map.set(mod, {
        modalidad: mod,
        label: mod === 'REMOTO' ? 'Remoto' : mod === 'PRESENCIAL' ? 'Presencial' : mod,
        total_nomina: 0,
        asistio_dia0: 0,
        asistio_dia1: 0,
        activos_ojt: 0,
        ingresos_iop: 0,
        activos_actuales: 0,
        grupos_count: 0
      });
    }
    const acc = map.get(mod);
    acc.total_nomina += g.total_nomina || 0;
    acc.asistio_dia0 += g.asistio_dia0 || 0;
    acc.asistio_dia1 += g.asistio_dia1 || 0;
    acc.activos_ojt += g.activos_ojt || 0;
    acc.ingresos_iop += g.ingresos_iop || 0;
    acc.activos_actuales += g.activos_actuales || 0;
    acc.grupos_count += 1;
  });

  return Array.from(map.values()).map(m => {
    const retencionDia1 = m.asistio_dia0 > 0 ? Math.round((m.asistio_dia1 / m.asistio_dia0) * 1000) / 10 : 0;
    const conversionIopVsNomina = m.total_nomina > 0 ? Math.round((m.ingresos_iop / m.total_nomina) * 1000) / 10 : 0;
    const conversionIopVsDia1 = m.asistio_dia1 > 0 ? Math.round((m.ingresos_iop / m.asistio_dia1) * 1000) / 10 : 0;
    const asistenciaDia0 = m.total_nomina > 0 ? Math.round((m.asistio_dia0 / m.total_nomina) * 1000) / 10 : 0;
    const retencionActualVsNomina = m.total_nomina > 0 ? Math.round((m.activos_actuales / m.total_nomina) * 1000) / 10 : 0;

    return {
      ...m,
      pct_asistencia_dia0: asistenciaDia0,
      pct_retencion_dia1: retencionDia1,
      pct_conversion_iop_nomina: conversionIopVsNomina,
      pct_conversion_iop_dia1: conversionIopVsDia1,
      pct_retencion_actual: retencionActualVsNomina
    };
  });
}

/**
 * Retorna las métricas agrupadas por modalidad con caché (TTL: 3 min)
 */
export async function getMetricasPorModalidad(gruposInfo) {
  if (DB_MODE !== 'supabase' || !gruposInfo || gruposInfo.length === 0) return [];
  
  const cacheKey = 'metricas_modalidad_' + [...new Set(gruposInfo.map(g => `${g.campana || ''}_${g.codigo || ''}`))].sort().join(',');

  return withCache(cacheKey, 180000, async () => {
    const metricas = await getMetricasResumenCapacitacion(gruposInfo);
    return agruparMetricasPorModalidad(metricas);
  });
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
export function parseFechaAsistencia(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
  } else if (raw.includes('-')) {
    const parts = raw.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].substring(0, 2).padStart(2, '0')}`;
      }
      if (parts[2].length >= 4) {
        return `${parts[2].substring(0, 4)}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return raw.substring(0, 10);
  }
  return raw;
}

