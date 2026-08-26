import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:WO3OywKqpoovtN1m@db.ujqehcpglfhnytzsyedp.supabase.co:5432/postgres';

const indexes = [
  {
    name: 'idx_nominas_campana_grupo',
    sql: 'CREATE INDEX IF NOT EXISTS idx_nominas_campana_grupo ON nominas(campana, grupo_codigo);'
  },
  {
    name: 'idx_nominas_documento',
    sql: 'CREATE INDEX IF NOT EXISTS idx_nominas_documento ON nominas(documento);'
  },
  {
    name: 'idx_nominas_reclutador_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_nominas_reclutador_id ON nominas(reclutador_id);'
  },
  {
    name: 'idx_asistencias_grupo_campana',
    sql: 'CREATE INDEX IF NOT EXISTS idx_asistencias_grupo_campana ON consolidado_asistencias(codigo_grupo, campana);'
  },
  {
    name: 'idx_asistencias_documento',
    sql: 'CREATE INDEX IF NOT EXISTS idx_asistencias_documento ON consolidado_asistencias(documento);'
  },
  {
    name: 'idx_asistencias_fecha',
    sql: 'CREATE INDEX IF NOT EXISTS idx_asistencias_fecha ON consolidado_asistencias(fecha_registro_asistencia);'
  }
];

async function applyIndexes() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    console.log('🔌 Conectando a Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Conexión exitosa. Creando índices de optimización...');

    for (const item of indexes) {
      console.log(`⏳ Aplicando: ${item.name}...`);
      await client.query(item.sql);
      console.log(`   ✓ ${item.name} listo.`);
    }

    console.log('\n🎉 ¡Todos los índices se crearon y validaron correctamente en la base de datos!');
  } catch (err) {
    console.error('❌ Error aplicando índices:', err.message);
  } finally {
    await client.end();
  }
}

applyIndexes();
