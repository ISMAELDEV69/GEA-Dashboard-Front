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
     let nRes = await client.query(`
        SELECT p.documento, p.nombres
        FROM postulantes p
        JOIN nominas n ON p.documento = n.postulante_documento
        JOIN grupos_capacitacion g ON n.grupo_id = g.id
        WHERE g.codigo = 'GPE-2026013' AND n.dia_0 = 'ASISTIO'
     `)
     
     let vRes = await client.query(`
        SELECT documento, nombres
        FROM v_nominas_consolidado
        WHERE grupo_codigo = 'GPE-2026013' AND dia_0 = 'ASISTIO'
     `)
     
     const vDocs = new Set(vRes.rows.map(r => r.documento))
     const missing = nRes.rows.filter(r => !vDocs.has(r.documento))
     console.log("Missing from view:", missing)
     
  } catch(e) {
     console.error("Error:", e.message)
  }
  await client.end()
}
run()
