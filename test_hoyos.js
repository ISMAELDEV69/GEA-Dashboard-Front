import pg from 'pg'
import bcrypt from 'bcryptjs'

const url = 'postgresql://postgres:3l4ahwgDfMtiBmpd@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres'

const { Client } = pg
const client = new Client({ 
  connectionString: url,
  ssl: { rejectUnauthorized: false }
})

async function run() {
  try {
    await client.connect()
    
    // Find auth user
    const res = await client.query(`
      SELECT id, email, encrypted_password, raw_user_meta_data 
      FROM auth.users 
      WHERE email ILIKE '%hoyos%' OR raw_user_meta_data->>'nombre' ILIKE '%hoyos%'
    `)
    
    console.log('Auth Users found:', res.rows.map(r => ({ email: r.email, meta: r.raw_user_meta_data })))
    
    // Find perfiles user
    const perRes = await client.query(`
      SELECT * FROM perfiles WHERE nombre ILIKE '%hoyos%' OR email ILIKE '%hoyos%'
    `)
    console.log('Perfiles found:', perRes.rows)

  } catch (err) {
    console.log('Error:', err.message)
  } finally {
    await client.end()
  }
}
run()
