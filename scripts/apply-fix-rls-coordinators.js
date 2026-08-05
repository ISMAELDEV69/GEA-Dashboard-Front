/**
 * Aplica actualización de políticas RLS para permitir gestión a coordinadores, supervisores y jefes en Supabase
 * Uso: node scripts/apply-fix-rls-coordinators.js
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
  const sql = fs.readFileSync(path.join('database', 'fix_rls_coordinators.sql'), 'utf8')
  await client.query(sql)
  console.log('✅ Políticas RLS actualizadas correctamente. Ahora coordinadores, supervisores y jefes pueden guardar metas y registros sin restricciones RLS.')
  await client.end()
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
