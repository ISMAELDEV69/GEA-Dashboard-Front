import pg from 'pg'

const url = 'postgresql://postgres:3l4ahwgDfMtiBmpd@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

const { Client } = pg
const client = new Client({ 
  connectionString: url,
  ssl: { rejectUnauthorized: false }
})

async function run() {
  try {
    await client.connect()
    
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'equipo_formacion';`)
    console.log('Formacion:', res.rows.map(r => r.column_name))

    const res2 = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'equipo_reclutamiento';`)
    console.log('Reclutamiento:', res2.rows.map(r => r.column_name))
    
  } catch (err) {
    console.log('Error:', err.message)
  } finally {
    await client.end()
  }
}
run()
