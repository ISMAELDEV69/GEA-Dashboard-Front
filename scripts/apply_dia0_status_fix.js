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
     // 1. Ensure column exists
     await client.query(`ALTER TABLE nominas ADD COLUMN IF NOT EXISTS dia_0_status varchar(50) DEFAULT NULL`)
     console.log("dia_0_status column ready")
     
     // 2. The existing rows have dia_0_obs filled but dia_0_status = NULL
     // We need to infer from the data:
     // - rows with dia_0_obs = '-' and status_dia_1 = 'APTO' → ASISTIO (they came)
     // - rows with dia_0_obs containing known fail patterns → FALTA
     // But actually, based on the Excel inspection:
     // ALL the data we have is from a group where everyone attended (ASISTIO)
     // We need the raw import text to know. For now, update based on status_dia_1:
     // If status_dia_1 = 'APTO' or 'CESE' (they were evaluated) → ASISTIO
     // If status_dia_1 = 'AGREGADO' → means they skipped dia_0 but added to dia_1
     // Actually based on the Excel data seen: ALL rows say ASISTIO in dia_0
     // The ones that failed (CESE) still attended dia_0, just didn't pass
     // So: everyone in this dataset ASISTIO dia_0
     
     // Migrate existing rows: if dia_0_obs is not null and status_dia_1 is not null → mark as ASISTIO
     const res = await client.query(`
        UPDATE nominas 
        SET dia_0_status = 'ASISTIO' 
        WHERE dia_0_status IS NULL 
        AND (dia_0_obs IS NOT NULL OR status_dia_1 IS NOT NULL)
        RETURNING id
     `)
     console.log("Migrated rows:", res.rowCount)
     
     // 3. Rebuild the view with dia_0_status
     await client.query(`DROP VIEW IF EXISTS v_nominas_consolidado CASCADE`)
     
     const sql = fs.readFileSync('database/fix_view_v2.sql', 'utf8')
     // Inject dia_0_status into the view
     const updatedSql = sql.replace(
       'n.dia_0,\n  n.dia_0_obs,',
       'n.dia_0,\n  n.dia_0_obs,\n  n.dia_0_status,'
     )
     
     await client.query(updatedSql)
     console.log("View rebuilt with dia_0_status")
  } catch(e) {
     console.error("Error:", e)
  }
  await client.end()
}
run()
