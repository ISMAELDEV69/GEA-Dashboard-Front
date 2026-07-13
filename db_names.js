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
    
    const res = await client.query(`SELECT apellido_paterno, apellido_materno, nombres_completos FROM equipo_formacion LIMIT 3;`)
    console.log('Formacion:', res.rows)

    const res2 = await client.query(`SELECT apellido_paterno, apellido_materno, nombres_completos FROM equipo_reclutamiento LIMIT 3;`)
    console.log('Reclutamiento:', res2.rows)
    
  } catch (err) {
    console.log('Error:', err.message)
  } finally {
    await client.end()
  }
}
run()
