/**
 * Aplica schema v2 y resetea datos operacionales en Supabase.
 * Uso: node scripts/apply-schema-v2.js
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
  console.error('❌ DATABASE_URL no configurado en .env.local')
  process.exit(1)
}

async function runSql(client, filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8')
  console.log(`\n📄 Ejecutando ${label}...`)
  await client.query(sql)
  console.log(`✅ ${label} completado`)
}

async function migrateFromV1(client) {
  console.log('\n🔄 Migrando desde schema v1 (si existe)...')

  // Renombrar tabla postulantes legacy si tiene columnas de reclutamiento mezcladas
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'postulantes' AND column_name = 'reclutador_id'
  `)

  if (rows.length > 0) {
    console.log('   Detectado schema v1 — respaldando y limpiando...')
    await client.query(`DROP TABLE IF EXISTS postulantes_legacy CASCADE`)
    await client.query(`ALTER TABLE postulantes RENAME TO postulantes_legacy`)
    console.log('   postulantes → postulantes_legacy (backup)')
  }
}

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅ Conectado a Supabase PostgreSQL')

  try {
    await migrateFromV1(client)
    await runSql(client, path.join('database', 'schema_v2.sql'), 'schema_v2.sql')
    await runSql(client, path.join('database', 'grupos_meta_migration.sql'), 'grupos_meta_migration.sql')
    await runSql(client, path.join('database', 'fix_audit_trigger.sql'), 'fix_audit_trigger.sql')
    await runSql(client, path.join('database', 'fix_registrar_nomina.sql'), 'fix_registrar_nomina.sql')
    await runSql(client, path.join('database', 'capacidad_rys_migration.sql'), 'capacidad_rys_migration.sql')
    await runSql(client, path.join('database', 'capacidad_sync_migration.sql'), 'capacidad_sync_migration.sql')
    await runSql(client, path.join('database', 'admin_create_user.sql'), 'admin_create_user.sql')
    await runSql(client, path.join('database', 'reset_database.sql'), 'reset_database.sql')

    const check = await client.query(`
      SELECT 'postulantes' AS t, COUNT(*)::int AS n FROM postulantes
      UNION ALL SELECT 'nominas', COUNT(*)::int FROM nominas
      UNION ALL SELECT 'perfiles', COUNT(*)::int FROM perfiles
    `)
    console.log('\n📊 Estado final:')
    console.table(check.rows)
    console.log('\n🎉 Base de datos lista para roleplay desde cero.')
    console.log('   1. Inicia sesión como admin')
    console.log('   2. Crea sedes, campañas y reclutadores en Metas/Usuarios')
    console.log('   3. Simula reclutador → Nómina → registrar postulante')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
