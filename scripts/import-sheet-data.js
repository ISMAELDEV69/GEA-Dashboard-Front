/**
 * Importa nómina y asistencia desde Google Sheets publicados
 * Uso: npm run db:import-sheets
 *      npm run db:sync-sheets  (descarga + importa)
 */
import fs from 'fs'
import path from 'path'
import pkg from 'pg'
import { SHEET_SOURCES } from '../src/lib/sheetSources.js'
import { parseCsvToMatrix, parseNominaRows } from '../src/lib/nominaConsolidadoSchema.js'
import {
  asistenciaRecordsFromNominaRow,
  extractGruposFromRows,
  toRegistrarNominaRpc,
} from '../src/lib/sheetImportUtils.js'
import { inferSegmento } from '../src/lib/sheetSources.js'

const { Client } = pkg

let connectionString = process.env.DATABASE_URL
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m)
    if (match) connectionString = match[1].trim()
  }
} catch { /* ignore */ }

if (!connectionString) {
  console.error('❌ DATABASE_URL no configurado en .env.local')
  process.exit(1)
}

async function resolveOrCreate(client, table, col, value, extra = {}) {
  const clean = value?.trim()
  if (!clean) return null
  const upper = clean.toUpperCase()
  const { rows } = await client.query(
    `SELECT id FROM ${table} WHERE UPPER(${col}) = $1 LIMIT 1`,
    [upper]
  )
  if (rows[0]) return rows[0].id
  if (table === 'campanas') {
    const ins = await client.query(
      'INSERT INTO campanas (nombre, segmento) VALUES ($1, $2) RETURNING id',
      [upper, extra.segmento || null]
    )
    return ins.rows[0].id
  }
  const ins = await client.query(
    `INSERT INTO ${table} (${col}) VALUES ($1) RETURNING id`,
    [clean]
  )
  return ins.rows[0].id
}

async function upsertGrupo(client, g) {
  const campanaId = await resolveOrCreate(client, 'campanas', 'nombre', g.campana_nombre, { segmento: g.segmento })
  await client.query(
    `INSERT INTO grupos_capacitacion (
      codigo, campana_id, fecha_registro, semana_trabajo, semana_label, modalidad,
      condicion, estado_grupo, periodo_capacitacion, rango_horario,
      fecha_inicio_ojt, fecha_ingreso_op
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (codigo) DO UPDATE SET
      campana_id = EXCLUDED.campana_id,
      semana_trabajo = COALESCE(EXCLUDED.semana_trabajo, grupos_capacitacion.semana_trabajo),
      semana_label = COALESCE(EXCLUDED.semana_label, grupos_capacitacion.semana_label),
      modalidad = EXCLUDED.modalidad,
      condicion = COALESCE(EXCLUDED.condicion, grupos_capacitacion.condicion),
      rango_horario = COALESCE(EXCLUDED.rango_horario, grupos_capacitacion.rango_horario),
      periodo_capacitacion = COALESCE(EXCLUDED.periodo_capacitacion, grupos_capacitacion.periodo_capacitacion),
      fecha_registro = COALESCE(EXCLUDED.fecha_registro, grupos_capacitacion.fecha_registro),
      estado_grupo = 'ACTIVO'`,
    [
      g.codigo, campanaId, g.fecha_registro || null, g.semana_trabajo, g.semana_label,
      g.modalidad, g.condicion, g.estado_grupo, g.periodo_capacitacion, g.rango_horario,
      g.fecha_inicio_ojt || null, g.fecha_ingreso_op || null,
    ]
  )
}

async function upsertAsistencia(client, rec) {
  await client.query(
    `INSERT INTO asistencias_capacitacion (
      postulante_documento, grupo_codigo, fecha_asistencia, sigla_asistencia, motivo_baja
    ) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (postulante_documento, grupo_codigo, fecha_asistencia)
    DO UPDATE SET sigla_asistencia = EXCLUDED.sigla_asistencia, motivo_baja = EXCLUDED.motivo_baja`,
    [rec.documento, rec.grupo_codigo, rec.fecha_asistencia, rec.sigla, rec.motivo_baja]
  )
}

function loadMatrix(source) {
  const filePath = path.resolve(process.cwd(), source.localFile)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}. Ejecuta npm run db:download-sheets`)
  }
  const text = fs.readFileSync(filePath, 'utf8')
  return parseCsvToMatrix(text)
}

async function importSource(client, source) {
  console.log(`\n📋 ${source.label}`)
  const matrix = loadMatrix(source)
  const rows = parseNominaRows(matrix, source.defaults)
  console.log(`   Filas válidas: ${rows.length}`)

  if (!rows.length) {
    console.log('   ⚠️  Sin datos — omitido')
    return { nominas: 0, asistencias: 0, grupos: 0 }
  }

  const grupos = extractGruposFromRows(rows)
  for (const g of grupos) {
    await upsertGrupo(client, g)
  }
  console.log(`   Grupos: ${grupos.length}`)

  let nominas = 0
  let asistencias = 0
  const seenDocs = new Set()

  for (const row of rows) {
    if (seenDocs.has(row.documento)) {
      console.log(`   ⏭️  Duplicado en archivo: ${row.documento}`)
      continue
    }
    seenDocs.add(row.documento)

    try {
      const reclutador_id = await resolveOrCreate(client, 'reclutadores', 'nombre_completo', row.reclutador)
      const sede_id = await resolveOrCreate(client, 'sedes', 'nombre', row.sede)
      const campana_id = await resolveOrCreate(client, 'campanas', 'nombre', row.campana, {
        segmento: inferSegmento(row.campana),
      })

      const rpc = toRegistrarNominaRpc(row, { reclutador_id, sede_id, campana_id })
      await client.query('SELECT registrar_nomina($1::jsonb)', [JSON.stringify(rpc)])
      nominas++

      if (source.importAsistencia) {
        const asis = asistenciaRecordsFromNominaRow(row)
        for (const a of asis) {
          await upsertAsistencia(client, a)
          asistencias++
        }
      }
    } catch (err) {
      console.error(`   ❌ DNI ${row.documento}: ${err.message}`)
    }
  }

  console.log(`   ✅ Nóminas: ${nominas} | Asistencias: ${asistencias}`)
  return { nominas, asistencias, grupos: grupos.length }
}

async function run() {
  const only = process.argv[2]
  const sources = only
    ? Object.values(SHEET_SOURCES).filter(s => s.id === only)
    : Object.values(SHEET_SOURCES)

  if (only && !sources.length) {
    console.error(`❌ Fuente desconocida: ${only}`)
    process.exit(1)
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    console.log('🚀 Importación Sheets → Supabase\n')
    await client.query('ALTER TABLE grupos_capacitacion DISABLE TRIGGER trg_sync_nominas_grupo')

    const totals = { nominas: 0, asistencias: 0, grupos: 0 }
    for (const source of sources) {
      const r = await importSource(client, source)
      totals.nominas += r.nominas
      totals.asistencias += r.asistencias
      totals.grupos += r.grupos
    }

    const { rows: summary } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM postulantes) AS postulantes,
        (SELECT COUNT(*) FROM nominas WHERE activo) AS nominas_activas,
        (SELECT COUNT(*) FROM grupos_capacitacion) AS grupos,
        (SELECT COUNT(*) FROM asistencias_capacitacion) AS asistencias
    `)

    console.log('\n📊 Estado BD:')
    console.table(summary[0])
    console.log(`\n🎉 Importación completada — ${totals.nominas} nóminas, ${totals.asistencias} asistencias, ${totals.grupos} grupos`)
  } finally {
    await client.query('ALTER TABLE grupos_capacitacion ENABLE TRIGGER trg_sync_nominas_grupo').catch(() => {})
    await client.end()
  }
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
