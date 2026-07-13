import pkg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const { Client } = pkg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

async function run() {
  const sqlPath = path.join(__dirname, 'update_goals_schema.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log("🔌 Connecting to Supabase...")
    await client.connect()
    console.log("🚀 Executing migration SQL...")
    await client.query(sql)
    console.log("🎉 Migration applied successfully!")
  } catch (err) {
    console.error("❌ Error applying migration:", err)
  } finally {
    await client.end()
  }
}

run()
