/**
 * Aplica migración flujo operativo (perfiles + atribución bajas)
 * Uso: npm run db:flujo-operativo
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

const sql = fs.readFileSync(path.join('database', 'flujo_operativo_migration.sql'), 'utf8')

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.log('✅ Migración flujo operativo aplicada.')
} finally {
  await client.end()
}
