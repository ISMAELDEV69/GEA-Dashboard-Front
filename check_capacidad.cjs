import pkg from 'pg'
const { Client } = pkg
const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'capacidad_rys'")
    console.log(res.rows.map(r => r.column_name).join(', '))
  } catch(e) {
    console.log(e)
  } finally {
    await client.end()
  }
}
run()
