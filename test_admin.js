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
    const res = await client.query(`SELECT id, email FROM auth.users WHERE email ILIKE '%admin%'`)
    console.log(res.rows)
  } catch (err) {
    console.log('Error:', err.message)
  } finally {
    await client.end()
  }
}
run()
