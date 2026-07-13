require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function fix() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Deshabilitar RLS para asegurar que la API anon la pueda leer
  await client.query('ALTER TABLE opciones_homologadas DISABLE ROW LEVEL SECURITY;');
  
  console.log("RLS deshabilitado para opciones_homologadas.");
  await client.end();
}
fix();
