import fs from 'fs'
import pkg from 'pg'
const { Client } = pkg

import path from 'path'

// Cargar DATABASE_URL desde .env.local o variables de entorno
let connectionString = process.env.DATABASE_URL

try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const match = envContent.match(/^DATABASE_URL=(.+)$/m)
    if (match) {
      connectionString = match[1].trim()
    }
  }
} catch (e) {
  console.warn("⚠️ No se pudo leer .env.local, usando variables del sistema:", e.message)
}

if (!connectionString || connectionString.includes("TU_CONTRASEÑA")) {
  console.error("❌ ERROR: DATABASE_URL no está configurado en .env.local o en las variables de entorno.")
  process.exit(1)
}

async function run() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Requerido para conexiones seguras con Supabase
    }
  })

  try {
    console.log("🔌 Conectando a la base de datos de Supabase...")
    await client.connect()
    console.log("✅ Conexión establecida con éxito.")

    console.log("🧹 Removiendo restricciones estrictas y de claves foráneas para permitir importación de datos históricos...")
    await client.query("ALTER TABLE postulantes DROP CONSTRAINT IF EXISTS chk_fecha_nac;")
    await client.query("ALTER TABLE postulantes DROP CONSTRAINT IF EXISTS chk_correo;")
    await client.query("ALTER TABLE postulantes DROP CONSTRAINT IF EXISTS chk_celular;")
    await client.query("ALTER TABLE asistencias_capacitacion DROP CONSTRAINT IF EXISTS asistencias_capacitacion_motivo_baja_fkey;")
    await client.query("ALTER TABLE asistencias_capacitacion DROP CONSTRAINT IF EXISTS asistencias_capacitacion_postulante_documento_fkey;")
    await client.query("ALTER TABLE asistencias_capacitacion DROP CONSTRAINT IF EXISTS asistencias_capacitacion_grupo_codigo_fkey;")
    await client.query("ALTER TABLE grupos_capacitacion DROP CONSTRAINT IF EXISTS grupos_capacitacion_formador_documento_fkey;")
    await client.query("ALTER TABLE grupos_capacitacion DROP CONSTRAINT IF EXISTS grupos_capacitacion_campana_id_fkey;")
    await client.query("ALTER TABLE evaluaciones_capacitacion DROP CONSTRAINT IF EXISTS evaluaciones_capacitacion_postulante_documento_fkey;")
    await client.query("ALTER TABLE evaluaciones_capacitacion DROP CONSTRAINT IF EXISTS evaluaciones_capacitacion_grupo_codigo_fkey;")

    console.log("✏️ Renombrando tabla 'campañas' a 'campanas' para compatibilidad con el código y scripts...")
    await client.query("ALTER TABLE IF EXISTS campañas RENAME TO campanas;")

    console.log("🔍 Consultando tablas existentes en la base de datos...")
    const tablesRes = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
    const tableNames = tablesRes.rows.map(r => r.table_name)
    console.log("📂 Tablas detectadas en Supabase:", tableNames)

    console.log("📖 Leyendo archivo 'inserts.sql'...")
    const sql = fs.readFileSync('inserts.sql', 'utf8')
    
    // Filtramos solo las líneas que contienen comandos INSERT
    const lines = sql.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('INSERT INTO'))

    console.log(`📊 Se encontraron ${lines.length} registros para importar.`)

    if (lines.length === 0) {
      console.log("⚠️ No se encontraron líneas válidas de INSERT en 'inserts.sql'.")
      return
    }

    // Ejecutamos en bloques (batches) de 200 consultas para optimizar rendimiento y estabilidad
    const batchSize = 200
    console.log("🚀 Iniciando inserción en lotes...")

    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize).join('\n')
      await client.query(batch)
      const end = Math.min(i + batchSize, lines.length)
      console.log(`🔹 [Progreso] Importados registros del ${i + 1} al ${end} (${Math.round((end / lines.length) * 100)}%)`)
    }

    console.log("🎉 ¡Todos los datos han sido importados con éxito a Supabase!")
  } catch (err) {
    console.error("❌ Ocurrió un error durante la importación:", err)
  } finally {
    await client.end()
    console.log("🔌 Conexión cerrada.")
  }
}

run()
