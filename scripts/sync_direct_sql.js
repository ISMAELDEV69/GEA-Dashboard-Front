import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import pkg from 'pg'
const { Client } = pkg

const DATABASE_URL = 'postgresql://postgres:WO3OywKqpoovtN1m@db.ujqehcpglfhnytzsyedp.supabase.co:5432/postgres'

async function syncDirectSql() {
  console.log('='.repeat(80))
  console.log('🔄 ACTUALIZACIÓN DIRECTA EN POSTGRES (UPDATE / INSERT)')
  console.log('='.repeat(80))

  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  console.log('✅ Conectado a PostgreSQL...')

  const csvPath = path.resolve(process.cwd(), 'nomina_retenciones - Hoja 1.csv')
  const csvText = fs.readFileSync(csvPath, 'utf8')
  const workbook = XLSX.read(csvText, { type: 'string', raw: false })
  const sheetName = workbook.SheetNames[0]
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })

  console.log(`Filas leídas del CSV: ${rawRows.length}`)

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
    const doc = String(r['Nro de DNI o C.E.'] || r['DNI'] || '').trim()
    if (!doc || doc === '-' || doc === '0') continue

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

    // 1. Intentar actualizar si ya existe
    const updateRes = await client.query(`
      UPDATE nominas
      SET
        cargo_contractual = $1,
        dia_0 = $2,
        dia_0_obs = $3,
        status_dia_1 = $4,
        dia_1 = $5,
        dia_1_obs = $6,
        grupo_codigo = $7,
        campana = $8,
        modalidad = $9,
        condicion = $10,
        horario_gestion = $11,
        descanso = $12,
        remuneracion = $13,
        bono_variable = $14,
        bono_movilidad = $15,
        bono_bienvenida = $16,
        bono_permanencia = $17,
        bono_asistencia_perfecta = $18,
        sede = $19,
        updated_at = NOW()
      WHERE documento = $20;
    `, [
      cargo, dia0, dia0Obs, statusDia1, dia1, dia1Obs,
      gCode, campana, modalidad, condicion, horario, descanso,
      parseNum(r['REMUNERACION']),
      parseNum(r['BONO 1 (VARIABLE)']),
      parseNum(r['BONO 2 (MOVILIDAD)']),
      parseNum(r['BONO 3 (BIENVENIDA)']),
      parseNum(r['BONO 4 (PERMANENCIA)']),
      parseNum(r['BONO 5 (ASISTENCIA PERFECTA)']),
      sede,
      doc
    ])

    if (updateRes.rowCount > 0) {
      updatedCount += updateRes.rowCount
    } else {
      // 2. Si no existe, insertar
      await client.query(`
        INSERT INTO nominas (
          documento, tipo_documento, apellido_paterno, apellido_materno, nombres,
          celular, celular_referencia, correo, genero, fecha_nacimiento, edad,
          estado_civil, n_hijos, nivel_academico, carrera, nacionalidad,
          lugar_residencia, distrito_residencia, direccion_domicilio,
          exp_call_center, exp_tipo_campana, exp_tiempo_call, exp_otra, exp_tiempo_otra,
          fuente_oferta, observacion_reclutamiento, campana, grupo_codigo, modalidad,
          condicion, horario_gestion, descanso, fecha_inicio_capacitacion, fecha_fin_capacitacion,
          fecha_conexion_ojt, fecha_conexion_op, pago_capacitacion, tipo_contratacion,
          razon_social, remuneracion, bono_variable, bono_movilidad, bono_bienvenida,
          bono_permanencia, bono_asistencia_perfecta, cargo_contractual,
          dia_0, dia_0_obs, status_dia_1, dia_1, dia_1_obs, sede,
          periodo_reclutado, semana_trabajo, activo, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
          $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52,
          $53, $54, $55, NOW()
        );
      `, [
        doc,
        String(r['TIPO DE DOCUMENTO'] || 'DNI').trim().toUpperCase(),
        String(r['APELLIDO PATERNO'] || '').trim().toUpperCase(),
        String(r['APELLIDO MATERNO'] || '').trim().toUpperCase(),
        String(r['NOMBRES COMPLETOS'] || '').trim().toUpperCase(),
        String(r['NÚMERO DE CELULAR / MÓVIL'] || '').trim(),
        String(r['NÚMERO DE CELULAR DE REFERENCIA'] || '').trim() || null,
        String(r['CORREO ELECTRONICO'] || '').trim().toLowerCase(),
        String(r['GÉNERO O SEXO DEL POSTULANTE'] || '').trim().toUpperCase(),
        parseDateStr(r['FECHA DE NACIMIENTO']),
        parseInt(r['EDAD']) || null,
        String(r['ESTADO CIVIL'] || '').trim().toUpperCase(),
        parseInt(r['N° de HIJOS']) || 0,
        String(r['NIVEL ACADÉMICO'] || '').trim().toUpperCase(),
        String(r['MENCIONAR CARREA'] || '').trim().toUpperCase(),
        String(r['NACIONALIDAD'] || 'PERUANA').trim().toUpperCase(),
        String(r['LUGAR DE RESIDENCIA ACTUAL'] || '').trim().toUpperCase(),
        String(r['DISTRITO DE RESIDENCIA'] || '').trim().toUpperCase(),
        String(r['DIRECCIÓN DE DOMICILIO ACTUAL'] || '').trim().toUpperCase(),
        String(r['¿CUENTAS CON EXPERIENCIA LABORAL EN CALL CENTER?'] || '').trim().toUpperCase(),
        String(r['¿QUE TIPO DE EXPERIENCIA TIENES? ( ORIENTADO A LA CAMPAÑA QUE POSTULAS)'] || '').trim().toUpperCase(),
        String(r['TIEMPO DE EXPERIENCIA'] || '').trim().toUpperCase(),
        String(r['DETALLANOS OTRA EXPERIENCIA LABORAL'] || '').trim().toUpperCase(),
        String(r['TIEMPO DE EXPERIENCIA_1'] || '').trim().toUpperCase(),
        String(r['¿CÓMO TE ENTERASTE DE LA OFERTA LABORAL?'] || 'COMPUTRABAJO').trim().toUpperCase(),
        String(r['OBSERVACION'] || '').trim(),
        campana,
        gCode,
        modalidad,
        condicion,
        horario,
        descanso,
        parseDateStr(r['INICIO DE CAPACITACIÓN']),
        parseDateStr(r['FIN DE CAPACITACIÓN']),
        parseDateStr(r['CONEXIÓN OJT']),
        parseDateStr(r['CONEXIÓN OP']),
        String(r['PAGO DE CAPACITACIÓN'] || '').trim(),
        String(r['TIPO DE CONTRATACIÓN'] || '').trim().toUpperCase(),
        String(r['RAZON SOCIAL'] || 'GEA').trim().toUpperCase(),
        parseNum(r['REMUNERACION']),
        parseNum(r['BONO 1 (VARIABLE)']),
        parseNum(r['BONO 2 (MOVILIDAD)']),
        parseNum(r['BONO 3 (BIENVENIDA)']),
        parseNum(r['BONO 4 (PERMANENCIA)']),
        parseNum(r['BONO 5 (ASISTENCIA PERFECTA)']),
        cargo,
        dia0,
        dia0Obs,
        statusDia1,
        dia1,
        dia1Obs,
        sede,
        '202608',
        31,
        true
      ])
      insertedCount++
    }
  }

  console.log(`\n🎉 PROCESO COMPLETADO EXITOSAMENTE:`)
  console.log(`   - Actualizados: ${updatedCount}`)
  console.log(`   - Insertados:   ${insertedCount}`)

  // Verificar muestra de GPE-2026013
  const res = await client.query(`
    SELECT documento, apellido_paterno, nombres, grupo_codigo, cargo_contractual, dia_0, status_dia_1, dia_1
    FROM nominas
    WHERE grupo_codigo = 'GPE-2026013'
    LIMIT 13;
  `)
  console.log('\n📊 ESTADO FINAL EN POSTGRES (GPE-2026013):')
  console.table(res.rows)

  await client.end()
}

syncDirectSql().catch(console.error)
