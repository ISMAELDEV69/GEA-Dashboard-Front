import pkg from 'pg';
const { Client } = pkg;

// Base de producción (Said / actual)
const DB_PROD = 'postgresql://postgres:WO3OywKqpoovtN1m@db.ujqehcpglfhnytzsyedp.supabase.co:5432/postgres';
// Base de Ismael (destino donde quieres trabajar)
const DB_ISMAEL = 'postgresql://postgres.lqvvhovfvwzaprdgdobc:3l4ahwgDfMtiBmpd@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

async function auditBoth() {
  const prod = new Client({ connectionString: DB_PROD, ssl: { rejectUnauthorized: false } });
  const ismael = new Client({ connectionString: DB_ISMAEL, ssl: { rejectUnauthorized: false } });

  try {
    await prod.connect();
    console.log('✅ Conectado a PROD (ujqehcpglfhnytzsyedp)\n');
    
    const prodTables = await prod.query(`
      SELECT 
        t.table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) AS tamaño,
        COUNT(c.column_name) AS columnas
      FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = 'public'
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name
      ORDER BY t.table_name;
    `);
    
    console.log('📊 TABLAS EN BASE DE PRODUCCIÓN (ujqehcpglfhnytzsyedp):');
    console.table(prodTables.rows);

    // Contar registros por tabla
    const counts = {};
    for (const row of prodTables.rows) {
      const r = await prod.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      counts[row.table_name] = parseInt(r.rows[0].count);
    }
    console.log('\n📊 TOTAL REGISTROS POR TABLA EN PRODUCCIÓN:');
    console.table(counts);

    await prod.end();
  } catch(e) {
    console.error('❌ Error conectando a PROD:', e.message);
  }

  try {
    await ismael.connect();
    console.log('\n✅ Conectado a ISMAEL (lqvvhovfvwzaprdgdobc)\n');
    
    const ismaelTables = await ismael.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('📊 TABLAS EN BASE DE ISMAEL (lqvvhovfvwzaprdgdobc):');
    console.table(ismaelTables.rows.map(r => r.table_name));
    
    await ismael.end();
  } catch(e) {
    console.error('❌ Error conectando a ISMAEL:', e.message);
  }
}

auditBoth();
