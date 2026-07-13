/**
 * Test end-to-end: reclutador guarda postulante → grupo auto → visible en consolidado
 * Uso: node scripts/test-nomina-flow.js
 */
import fs from 'fs'
import path from 'path'
import pkg from 'pg'
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
  console.error('❌ DATABASE_URL no configurado')
  process.exit(1)
}

async function applyFixes(client) {
  for (const file of ['fix_audit_trigger.sql', 'fix_registrar_nomina.sql']) {
    const sql = fs.readFileSync(path.join('database', file), 'utf8')
    console.log(`📄 Aplicando ${file}...`)
    await client.query(sql)
  }
}

async function run() {
  const client = new Client({ connectionString })
  await client.connect()

  try {
    await applyFixes(client)

    const testDoc = `99${Date.now().toString().slice(-8)}`
    console.log(`\n🧪 Registrando postulante de prueba DNI: ${testDoc}`)

    // Catálogos
    const rec = await client.query(
      `INSERT INTO reclutadores (nombre_completo) VALUES ('TEST RECLUTADOR AUTO') ON CONFLICT (nombre_completo) DO UPDATE SET activo=true RETURNING id`
    ).catch(async () => {
      const r = await client.query(`SELECT id FROM reclutadores WHERE nombre_completo ILIKE 'TEST RECLUTADOR AUTO' LIMIT 1`)
      return r
    })
    const recId = rec.rows[0]?.id || (await client.query(`SELECT id FROM reclutadores LIMIT 1`)).rows[0].id

    const sede = await client.query(
      `INSERT INTO sedes (nombre) VALUES ('SAN ISIDRO') ON CONFLICT (nombre) DO NOTHING RETURNING id`
    )
    const sedeId = sede.rows[0]?.id || (await client.query(`SELECT id FROM sedes WHERE nombre='SAN ISIDRO'`)).rows[0].id

    const camp = await client.query(
      `INSERT INTO campanas (nombre, segmento) VALUES ('RETENCIONES', 'CLARO PERU RETENCIONES') ON CONFLICT (nombre) DO UPDATE SET segmento='CLARO PERU RETENCIONES' RETURNING id`
    )
    const campId = camp.rows[0]?.id || (await client.query(`SELECT id FROM campanas WHERE nombre='RETENCIONES'`)).rows[0].id

    const payload = {
      documento: testDoc,
      tipo_documento: 'DNI',
      apellido_paterno: 'TEST',
      apellido_materno: 'AUTO',
      nombres: 'FLUJO E2E',
      celular: '999888777',
      correo: 'test@gea.local',
      genero: 'MASCULINO',
      fecha_nacimiento: '2000-01-15',
      estado_civil: 'SOLTERO',
      n_hijos: 0,
      nivel_academico: 'UNIVERSITARIO',
      periodo_reclutado: '202606',
      semana_trabajo: 26,
      reclutador_id: recId,
      sede_id: sedeId,
      campana_id: campId,
    }

    const { rows: nominaRows } = await client.query(
      `SELECT registrar_nomina($1::jsonb) AS nomina_id`,
      [JSON.stringify(payload)]
    )
    const nominaId = nominaRows[0].nomina_id
    console.log(`✅ Nómina creada — ID: ${nominaId}`)

    const { rows: view } = await client.query(
      `SELECT nomina_id, documento, nombres, campana, grupo_codigo, semana_trabajo, estado
       FROM v_nominas_consolidado WHERE nomina_id = $1`,
      [nominaId]
    )
    console.log('\n📋 Vista consolidado:')
    console.table(view)

    const grupo = view[0]?.grupo_codigo
    if (!grupo) throw new Error('No se generó grupo_codigo automáticamente')

    const { rows: grupoCheck } = await client.query(
      `SELECT codigo, campana_id, semana_trabajo FROM grupos_capacitacion WHERE codigo = $1`,
      [grupo]
    )
    console.log('\n👥 Grupo capacitación:')
    console.table(grupoCheck)

    // Cleanup test data
    await client.query(`DELETE FROM nominas WHERE id = $1`, [nominaId])
    await client.query(`DELETE FROM postulantes WHERE documento = $1`, [testDoc])

    console.log('\n🎉 Test E2E exitoso — flujo reclutador → grupo → capacitador OK')
    console.log(`   Grupo generado: ${grupo}`)
    console.log('   (datos de prueba eliminados)')
  } catch (err) {
    console.error('❌ Test falló:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
