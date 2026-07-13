/**
 * Importa todo el CSV CAPACIDAD_RYS v.Final a Supabase
 * Uso: npm run db:import-capacidad
 */
import fs from 'fs'
import path from 'path'
import pkg from 'pg'
const { Client } = pkg

// Reutilizar parser del frontend vía lectura inline simplificada
import { parseCapacidadRysCsv } from '../src/lib/capacidadRysSchema.js'

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

async function resolveOrCreateCampana(client, nombre, segmento) {
  const clean = nombre?.trim().toUpperCase()
  if (!clean) throw new Error('Campaña vacía')
  const { rows } = await client.query(
    'SELECT id, segmento FROM campanas WHERE UPPER(nombre) = $1 LIMIT 1',
    [clean]
  )
  if (rows[0]) {
    if (segmento?.trim()) {
      await client.query(
        'UPDATE campanas SET segmento = $1 WHERE id = $2 AND (segmento IS NULL OR segmento = \'\')',
        [segmento.trim().toUpperCase(), rows[0].id]
      )
    }
    return rows[0].id
  }
  const ins = await client.query(
    'INSERT INTO campanas (nombre, segmento) VALUES ($1, $2) RETURNING id',
    [clean, segmento?.trim().toUpperCase() || null]
  )
  return ins.rows[0].id
}

async function upsertGrupo(client, p) {
  const campanaId = await resolveOrCreateCampana(client, p.campana_nombre, p.segmento)
  await client.query(
    `INSERT INTO grupos_capacitacion (
      codigo, campana_id, fecha_registro, semana_trabajo, semana_label, modalidad,
      area_traslado, condicion, estado_grupo, periodo_capacitacion, rango_horario,
      extension_teoria, fecha_inicio_ojt, extension_ojt, fecha_ingreso_op,
      rq_solicitado, rq_ftes_solicitado, meta_dia_0, meta_dia_1, periodo_ingreso_op, periodo_rys
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    )
    ON CONFLICT (codigo) DO UPDATE SET
      campana_id = EXCLUDED.campana_id,
      fecha_registro = EXCLUDED.fecha_registro,
      semana_trabajo = EXCLUDED.semana_trabajo,
      semana_label = EXCLUDED.semana_label,
      modalidad = EXCLUDED.modalidad,
      area_traslado = EXCLUDED.area_traslado,
      condicion = EXCLUDED.condicion,
      estado_grupo = EXCLUDED.estado_grupo,
      periodo_capacitacion = EXCLUDED.periodo_capacitacion,
      rango_horario = EXCLUDED.rango_horario,
      extension_teoria = EXCLUDED.extension_teoria,
      fecha_inicio_ojt = EXCLUDED.fecha_inicio_ojt,
      extension_ojt = EXCLUDED.extension_ojt,
      fecha_ingreso_op = EXCLUDED.fecha_ingreso_op,
      rq_solicitado = EXCLUDED.rq_solicitado,
      rq_ftes_solicitado = EXCLUDED.rq_ftes_solicitado,
      meta_dia_0 = EXCLUDED.meta_dia_0,
      meta_dia_1 = EXCLUDED.meta_dia_1,
      periodo_ingreso_op = EXCLUDED.periodo_ingreso_op,
      periodo_rys = EXCLUDED.periodo_rys`,
    [
      p.codigo, campanaId, p.fecha_registro, p.semana_trabajo, p.semana_label, p.modalidad,
      p.area_traslado, p.condicion, p.estado_grupo, p.periodo_capacitacion, p.rango_horario,
      p.extension_teoria, p.fecha_inicio_ojt, p.extension_ojt, p.fecha_ingreso_op,
      p.rq_solicitado, p.rq_ftes_solicitado, p.meta_dia_0, p.meta_dia_1, p.periodo_ingreso_op, p.periodo_rys,
    ]
  )
}

async function run() {
  const csvPath = path.join('scripts', 'capacidad_rys.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('❌ No existe scripts/capacidad_rys.csv')
    process.exit(1)
  }

  const text = fs.readFileSync(csvPath, 'utf8')
  const payloads = parseCapacidadRysCsv(text)
  console.log(`📄 ${payloads.length} filas CAPACIDAD_RYS detectadas`)

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Asegurar columnas
  const migPath = path.join('database', 'capacidad_rys_migration.sql')
  if (fs.existsSync(migPath)) {
    await client.query(fs.readFileSync(migPath, 'utf8'))
  }
  const syncPath = path.join('database', 'capacidad_sync_migration.sql')
  if (fs.existsSync(syncPath)) {
    await client.query(fs.readFileSync(syncPath, 'utf8'))
  }

  let ok = 0
  let fail = 0
  await client.query('ALTER TABLE grupos_capacitacion DISABLE TRIGGER trg_sync_nominas_grupo')
  for (let i = 0; i < payloads.length; i++) {
    try {
      await upsertGrupo(client, payloads[i])
      ok++
      if ((i + 1) % 100 === 0) console.log(`   … ${i + 1}/${payloads.length}`)
    } catch (err) {
      fail++
      if (fail <= 5) console.warn(`   ⚠ ${payloads[i].codigo}: ${err.message}`)
    }
  }
  await client.query('ALTER TABLE grupos_capacitacion ENABLE TRIGGER trg_sync_nominas_grupo')

  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM grupos_capacitacion')
  console.log(`\n✅ Importación: ${ok} OK, ${fail} errores`)
  console.log(`📊 Total grupos en BD: ${rows[0].n}`)
  await client.end()
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
