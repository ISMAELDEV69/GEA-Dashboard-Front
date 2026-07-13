/**
 * Aplica campos documentación nómina + vista consolidada
 * Uso: npm run db:nomina-fields
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

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(fs.readFileSync(path.join('database', 'nomina_docs_migration.sql'), 'utf8'))
  // Re-aplicar registrar_nomina con campos doc (desde capacidad_sync)
  const sync = fs.readFileSync(path.join('database', 'capacidad_sync_migration.sql'), 'utf8')
  const fnMatch = sync.match(/CREATE OR REPLACE FUNCTION registrar_nomina[\s\S]+?\$\$ LANGUAGE plpgsql/)
  if (fnMatch) {
    await client.query(fnMatch[0] + ' SECURITY DEFINER SET search_path = public;')
  }
  console.log('✅ Campos consolidado nómina aplicados.')
  await client.end()
}

run().catch(e => { console.error('❌', e.message); process.exit(1) })
