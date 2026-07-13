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

const ADMIN_EMAIL = 'clydelean@gmail.com'

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅ Conectado a Supabase')

  await client.query(`
    INSERT INTO public.perfiles (id, nombre, rol)
    SELECT u.id,
      COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1), 'Usuario'),
      CASE WHEN (u.raw_user_meta_data->>'rol') IN ('admin','reclutador','formador','visor')
        THEN (u.raw_user_meta_data->>'rol')::app_role ELSE 'visor'::app_role END
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = u.id)
    ON CONFLICT (id) DO NOTHING
  `)
  console.log('✅ Perfiles sincronizados')

  const { rows } = await client.query(`
    UPDATE public.perfiles SET rol = 'admin'
    WHERE id = (SELECT id FROM auth.users WHERE email = $1 LIMIT 1)
    RETURNING id, nombre, rol
  `, [ADMIN_EMAIL])

  if (rows.length === 0) {
    console.log('⚠️ No se encontró usuario con email:', ADMIN_EMAIL)
    console.log('   Verifica que la cuenta exista en Supabase → Authentication → Users')
  } else {
    console.log('🎉 Cuenta promovida a admin:', rows[0])
  }

  const all = await client.query(`
    SELECT u.email, p.nombre, p.rol
    FROM auth.users u
    LEFT JOIN public.perfiles p ON p.id = u.id
    ORDER BY u.created_at DESC
  `)
  console.log('\n--- Usuarios actuales ---')
  console.table(all.rows)

  await client.end()
}

run().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
