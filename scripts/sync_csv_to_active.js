import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function syncCsvToActiveDatabase() {
  console.log('='.repeat(80))
  console.log('🔄 ACTUALIZANDO NÓMINAS DESDE CSV HACIA SUPABASE DE PRODUCCIÓN')
  console.log('='.repeat(80))

  const csvPath = path.resolve(process.cwd(), 'nomina_retenciones - Hoja 1.csv')
  const csvText = fs.readFileSync(csvPath, 'utf8')
  const workbook = XLSX.read(csvText, { type: 'string', raw: false })
  const sheetName = workbook.SheetNames[0]
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })

  console.log(`Filas encontradas en el archivo CSV: ${rawRows.length}`)

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
    return null
  }

  let updatedCount = 0
  let insertedCount = 0

  for (const r of rawRows) {
    let doc = String(r['Nro de DNI o C.E.'] || r['DNI'] || '').trim()
    if (!doc || doc === '-' || doc === '0') continue

    // Normalizar DNI con ceros si tiene 8 dígitos o extranjeros
    const gCode = String(r['GRUPO'] || '').trim()
    const campana = String(r['CAMPAÑA'] || 'RETENCIONES FIJA INBOUND').trim()
    const dia0 = String(r['DIA 0'] || '').trim().toUpperCase() || null
    const dia0Obs = String(r['OBSERVACIONES'] || '').trim() || null
    const statusDia1 = String(r['STATUS'] || '').trim().toUpperCase() || null
    const dia1 = String(r['DIA 1'] || '').trim().toUpperCase() || null
    const dia1Obs = String(r['OBSERVACIONES_1'] || '').trim() || null
    const cargo = String(r['CARGO CONTRACTUAL'] || '').trim() || null
    const sede = String(r['SEDE'] || 'JOCKEY').trim().toUpperCase()
    const modalidad = String(r['MODALIDAD'] || 'PRESENCIAL').trim().toUpperCase()
    const condicion = String(r['CONDICIÓN'] || 'FULL TIME').trim().toUpperCase()
    const horario = String(r['HORARIO DE GESTIÓN'] || '').trim()
    const descanso = String(r['DESCANSO'] || 'ROTATIVO').trim().toUpperCase()

    const payload = {
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
      campana,
      grupo_codigo: gCode,
      modalidad,
      condicion,
      horario_gestion: horario,
      descanso,
      fecha_inicio_capacitacion: parseDateStr(r['INICIO DE CAPACITACIÓN']),
      fecha_fin_capacitacion: parseDateStr(r['FIN DE CAPACITACIÓN']),
      fecha_conexion_ojt: parseDateStr(r['CONEXIÓN OJT']),
      fecha_conexion_op: parseDateStr(r['CONEXIÓN OP']),
      pago_capacitacion: String(r['PAGO DE CAPACITACIÓN'] || '').trim(),
      tipo_contratacion: String(r['TIPO DE CONTRATACIÓN'] || '').trim().toUpperCase(),
      razon_social: String(r['RAZON SOCIAL'] || 'GEA').trim().toUpperCase(),
      remuneracion: parseNum(r['REMUNERACION']),
      bono_variable: parseNum(r['BONO 1 (VARIABLE)']),
      bono_movilidad: parseNum(r['BONO 2 (MOVILIDAD)']),
      bono_bienvenida: parseNum(r['BONO 3 (BIENVENIDA)']),
      bono_permanencia: parseNum(r['BONO 4 (PERMANENCIA)']),
      bono_asistencia_perfecta: parseNum(r['BONO 5 (ASISTENCIA PERFECTA)']),
      cargo_contractual: cargo,
      dia_0: dia0,
      dia_0_obs: dia0Obs,
      status_dia_1: statusDia1,
      dia_1: dia1,
      dia_1_obs: dia1Obs,
      sede,
      periodo_reclutado: '202608',
      semana_trabajo: 31,
      activo: true,
      updated_at: new Date().toISOString()
    }

    // Buscar si existe en la BD
    const { data: existing } = await supabase
      .from('nominas')
      .select('id, documento')
      .eq('documento', doc)
      .maybeSingle()

    if (existing) {
      const { error: errUpd } = await supabase
        .from('nominas')
        .update(payload)
        .eq('documento', doc)

      if (!errUpd) updatedCount++
      else console.log(`Error actualizando ${doc}:`, errUpd.message)
    } else {
      const { error: errIns } = await supabase
        .from('nominas')
        .insert(payload)

      if (!errIns) insertedCount++
      else console.log(`Error insertando ${doc}:`, errIns.message)
    }
  }

  console.log(`\n✅ Resumen de Sincronización:`)
  console.log(`   - Registros actualizados con Día 0 y Día 1: ${updatedCount}`)
  console.log(`   - Registros nuevos insertados:             ${insertedCount}`)
}

syncCsvToActiveDatabase().catch(console.error)
