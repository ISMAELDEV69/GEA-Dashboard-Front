import fs from 'fs'
import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
}

const client = new Client({ connectionString: dbUrl })

async function run() {
  await client.connect()
  try {
     const res = await client.query(`
        SELECT a.grupo_codigo, count(DISTINCT n.id)
        FROM nominas n
        JOIN asistencias a ON a.postulante_documento = n.postulante_documento
        WHERE n.grupo_id IS NULL
        GROUP BY a.grupo_codigo
     `)
     console.log("Asistencias link:", res.rows)
     
     // Update them automatically
     const updateRes = await client.query(`
        UPDATE nominas n
        SET grupo_id = g.id
        FROM asistencias a
        JOIN grupos_capacitacion g ON a.grupo_codigo = g.codigo
        WHERE n.postulante_documento = a.postulante_documento
        AND n.grupo_id IS NULL
        AND a.grupo_codigo IS NOT NULL
        RETURNING n.id
     `)
     console.log("Restored via asistencias:", updateRes.rowCount)
     
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
