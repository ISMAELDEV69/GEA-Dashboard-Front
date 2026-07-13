import pg from 'pg'
import fs from 'fs'

const { Client } = pg

const envContent = fs.readFileSync('.env.local', 'utf8')
const url = envContent.match(/DATABASE_URL=(.*)/)[1]

const client = new Client({ connectionString: url })

async function run() {
  await client.connect()
  try {
    const res = await client.query(`
      SELECT id, email, raw_user_meta_data->>'nombre' as nombre, raw_user_meta_data->>'rol' as rol
      FROM auth.users
      WHERE 
        LOWER(COALESCE(raw_user_meta_data->>'nombre', '')) NOT IN (
          SELECT LOWER(usuario_alix) FROM equipo_formacion WHERE usuario_alix IS NOT NULL
          UNION
          SELECT LOWER(nombres_completos) FROM equipo_formacion WHERE nombres_completos IS NOT NULL
          UNION
          SELECT LOWER(alix) FROM equipo_reclutamiento WHERE alix IS NOT NULL
          UNION
          SELECT LOWER(nombres_completos) FROM equipo_reclutamiento WHERE nombres_completos IS NOT NULL
        )
    `)
    console.log("Orphans:", res.rows)
  } catch (err) {
    console.error(err)
  } finally {
    await client.end()
  }
}
run()
