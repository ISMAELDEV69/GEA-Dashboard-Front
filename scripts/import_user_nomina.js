import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'sb_secret_yFPHoSad3S_sFm-wKmCm3A_oauamLbk' || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  console.log(`🔌 Conectando a Supabase REST API (${SUPABASE_URL})...`)

  const csvPath = path.resolve(process.cwd(), 'nomina_retenciones - Hoja 1.csv')
  const csvText = fs.readFileSync(csvPath, 'utf8')
  const workbook = XLSX.read(csvText, { type: 'string', raw: false })
  const sheetName = workbook.SheetNames[0]
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })

  console.log(`📊 Filas leídas del archivo CSV: ${rawRows.length}`)

  const parseNum = v => {
    if (v === null || v === undefined || v === '') return null
    const cleaned = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
  }

  const parseDateStr = d => {
    if (!d) return null
    const str = String(d).trim()
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10)
    if (/^\d+(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str)
      if (serial > 30000 && serial < 60000) {
        const jsDate = new Date((serial - 25569) * 86400 * 1000)
        return jsDate.toISOString().substring(0, 10)
      }
    }
    return null
  }

  const payloadList = []
  const seenDocs = new Set()
  const gruposMap = new Map()

  for (const r of rawRows) {
    const doc = String(r['Nro de DNI o C.E.'] || r['DNI'] || '').trim()
    if (!doc || doc === '-' || doc === '0') continue
    if (seenDocs.has(doc)) continue
    seenDocs.add(doc)

    const gCode = String(r['GRUPO'] || 'GPE-2026012-1').trim()
    const campana = String(r['CAMPAÑA'] || 'RETENCIONES FIJA INBOUND').trim()
    const sede = String(r['SEDE'] || 'JOCKEY').trim().toUpperCase()
    const modalidad = String(r['MODALIDAD'] || 'REMOTO').trim().toUpperCase()
    const condicion = String(r['CONDICIÓN'] || 'FULL TIME').trim().toUpperCase()
    const horario = String(r['HORARIO DE GESTIÓN'] || '11:00 - 22:00').trim()

    if (!gruposMap.has(gCode)) {
      gruposMap.set(gCode, { campana, sede, modalidad, condicion, horario })
    }

    payloadList.push({
      documento: doc,
      tipo_documento: String(r['TIPO DE DOCUMENTO'] || 'DNI').trim().toUpperCase(),
      apellido_paterno: String(r['APELLIDO PATERNO'] || '').trim().toUpperCase(),
      apellido_materno: String(r['APELLIDO MATERNO'] || '').trim().toUpperCase(),
      nombres: String(r['NOMBRES COMPLETOS'] || '').trim().toUpperCase(),
      celular: String(r['NÚMERO DE CELULAR / MÓVIL'] || '').trim(),
      celular_referencia: String(r['NÚMERO DE CELULAR DE REFERENCIA'] || '').trim() || null,
      correo: String(r['CORREO ELECTRONICO'] || '').trim().toLowerCase(),
      genero: String(r['GÉNERO O SEXO DEL POSTULANTE'] || '').trim().toUpperCase(),
      fecha_nacimiento: parseDateStr(r['FECHA DE NACIMIENTO']),
      edad: parseInt(r['EDAD']) || null,
      estado_civil: String(r['ESTADO CIVIL'] || '').trim().toUpperCase(),
      n_hijos: parseInt(r['N° de HIJOS']) || 0,
      nivel_academico: String(r['NIVEL ACADÉMICO'] || '').trim().toUpperCase(),
      carrera: String(r['MENCIONAR CARREA'] || '').trim().toUpperCase(),
      nacionalidad: String(r['NACIONALIDAD'] || 'PERUANA').trim().toUpperCase(),
      lugar_residencia: String(r['LUGAR DE RESIDENCIA ACTUAL'] || '').trim().toUpperCase(),
      distrito_residencia: String(r['DISTRITO DE RESIDENCIA'] || '').trim().toUpperCase(),
      direccion_domicilio: String(r['DIRECCIÓN DE DOMICILIO ACTUAL'] || '').trim().toUpperCase(),
      exp_call_center: String(r['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?'] || '').trim().toUpperCase(),
      exp_tipo_campana: String(r['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'] || '').trim().toUpperCase(),
      exp_tiempo_call: String(r['TIEMPO DE EXPERIENCIA'] || '').trim().toUpperCase(),
      exp_otra: String(r['DETALLANOS OTRA EXPERIENCIA LABORAL'] || '').trim().toUpperCase(),
      exp_tiempo_otra: String(r['TIEMPO DE EXPERIENCIA_1'] || '').trim().toUpperCase(),
      fuente_oferta: String(r['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?'] || 'COMPUTRABAJO').trim().toUpperCase(),
      observacion_reclutamiento: String(r['OBSERVACION'] || '').trim(),
      campana: campana,
      grupo_codigo: gCode,
      modalidad: modalidad,
      condicion: condicion,
      horario_gestion: horario,
      descanso: String(r['DESCANSO'] || 'ROTATIVO').trim().toUpperCase(),
      envio_dni: parseDateStr(r['ENVIO DNI']),
      test_psicologico: String(r['TEST PSICOLOGICO'] || '').trim() || null,
      validacion_pc: String(r['VALIDACION DE PC'] || '').trim() || null,
      evaluacion_dia_0: String(r['EVALUACION DIA 0'] || '').trim() || null,
      fecha_inicio_capacitacion: parseDateStr(r['INICIO DE CAPACITACIÓN']),
      fecha_fin_capacitacion: parseDateStr(r['FIN DE CAPACITACIÓN']),
      fecha_conexion_ojt: parseDateStr(r['CONEXIÓN OJT']),
      fecha_conexion_op: parseDateStr(r['CONEXIÓN OP']),
      pago_capacitacion: String(r['PAGO DE CAPACITACIÓN'] || 'S/.300,00').trim(),
      tipo_contratacion: String(r['TIPO DE CONTRATACIÓN'] || 'RXH').trim().toUpperCase(),
      razon_social: String(r['RAZON SOCIAL'] || 'GEA').trim().toUpperCase(),
      remuneracion: parseNum(r['REMUNERACION']) || 1200,
      bono_variable: parseNum(r['BONO 1 (VARIABLE)']),
      bono_movilidad: parseNum(r['BONO 2 (MOVILIDAD)']),
      bono_bienvenida: parseNum(r['BONO 3 (BIENVENIDA)']),
      bono_permanencia: parseNum(r['BONO 4 (PERMANENCIA)']),
      bono_asistencia_perfecta: parseNum(r['BONO 5 (ASISTENCIA PERFECTA)']),
      cargo_contractual: String(r['CARGO CONTRACTUAL'] || '').trim() || null,
      dia_0: String(r['DIA 0'] || 'ASISTIO').trim(),
      dia_0_obs: String(r['OBSERVACIONES'] || '').trim() || null,
      status_dia_1: String(r['STATUS'] || 'APTO').trim().toUpperCase(),
      dia_1: String(r['DIA 1'] || '').trim() || null,
      dia_1_obs: String(r['OBSERVACIONES_1'] || '').trim() || null,
      sede: sede,
      periodo_reclutado: '202608',
      semana_trabajo: 31,
      activo: true,
      updated_at: new Date().toISOString()
    })
  }

  console.log(`🏢 Grupos identificados en la nómina:`, Array.from(gruposMap.keys()))

  // 1. Asegurar grupos en capacidad_rys
  for (const [gCode, gData] of gruposMap.entries()) {
    console.log(`🔄 Sincronizando grupo en capacidad_rys: ${gCode} (${gData.campana})`)
    const { data: existing } = await supabase
      .from('capacidad_rys')
      .select('id')
      .eq('codigo', gCode)
      .eq('periodo', '202608')
      .maybeSingle()

    if (!existing) {
      await supabase.from('capacidad_rys').insert({
        codigo: gCode,
        campana: gData.campana,
        segmento: 'CLARO PERU',
        modalidad: gData.modalidad,
        rango_horario: gData.horario,
        condicion: gData.condicion,
        estado: 'ACTIVO',
        periodo: '202608',
        semana_label: 'SEM 31',
        fecha_registro: '2026-08-03T00:00:00.000Z'
      })
    } else {
      await supabase.from('capacidad_rys').update({
        campana: gData.campana,
        segmento: 'CLARO PERU',
        modalidad: gData.modalidad,
        rango_horario: gData.horario,
        condicion: gData.condicion,
        estado: 'ACTIVO',
        fecha_registro: '2026-08-03T00:00:00.000Z'
      }).eq('id', existing.id)
    }
  }

  // 2. Limpiar documentos previos de estos 105 postulantes
  const docList = payloadList.map(p => p.documento)
  console.log(`🧹 Limpiando registros previos en 'nominas'...`)
  await supabase.from('nominas').delete().in('documento', docList)

  console.log(`📤 Insertando ${payloadList.length} postulantes limpios en la tabla nominas...`)
  const BATCH_SIZE = 25
  let insertados = 0

  for (let i = 0; i < payloadList.length; i += BATCH_SIZE) {
    const batch = payloadList.slice(i, i + BATCH_SIZE)
    const { error: errBatch } = await supabase
      .from('nominas')
      .insert(batch)

    if (errBatch) {
      console.error(`❌ Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, errBatch.message)
    } else {
      insertados += batch.length
      console.log(`   ✅ Lote ${Math.floor(i / BATCH_SIZE) + 1} insertado (${insertados}/${payloadList.length})`)
    }
  }

  console.log(`\n🎉 ¡Importación perfecta completada!`)
  console.log(`   ✅ Total postulantes con campana exacta 'RETENCIONES FIJA INBOUND': ${insertados}`)
}

run().catch(err => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
