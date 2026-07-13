/**
 * Aplica solo la migración CAPACIDAD_RYS (columnas + vista) sin resetear datos.
 * Uso: npm run db:capacidad
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

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  const sql = fs.readFileSync(path.join('database', 'capacidad_rys_migration.sql'), 'utf8')
  console.log('📄 Aplicando capacidad_rys_migration.sql...')
  await client.query(sql)
  console.log('✅ Migración CAPACIDAD_RYS aplicada.')
  const syncPath = path.join('database', 'capacidad_sync_migration.sql')
  if (fs.existsSync(syncPath)) {
    console.log('📄 Aplicando capacidad_sync_migration.sql...')
    await client.query(fs.readFileSync(syncPath, 'utf8'))
    console.log('✅ Sincronización CAPACIDAD_RYS aplicada.')
  }
  await client.end()
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
