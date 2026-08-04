/**
 * Aplica RPC admin_reset_user_password y admin_create_user en Supabase
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
  const sql1 = fs.readFileSync(path.join('database', 'admin_create_user.sql'), 'utf8')
  await client.query(sql1)
  console.log('✅ Función admin_create_user verificada.')
  const sql2 = fs.readFileSync(path.join('database', 'admin_reset_user_password.sql'), 'utf8')
  await client.query(sql2)
  console.log('✅ Función admin_reset_user_password lista — cambio de claves en PostgreSQL habilitado.')
  await client.end()
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
