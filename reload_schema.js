import pkg from 'pg'
const { Client } = pkg

const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    await client.query(`NOTIFY pgrst, 'reload schema';`)
    console.log("Notified PostgREST to reload schema cache.")
  } catch (err) {
    console.error(err)
  } finally {
    await client.end()
  }
}

run()
