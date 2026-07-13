const { Client } = require('pg');
const connectionString = 'postgresql://postgres:ismael3953036POM@db.lqvvhovfvwzaprdgdobc.supabase.co:5432/postgres';

async function run() {
  const action = process.argv[2];
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  if (action === 'disable') {
    await client.query('ALTER TABLE nominas DISABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE capacidad_rys DISABLE ROW LEVEL SECURITY;');
    console.log('RLS disabled.');
  } else {
    await client.query('ALTER TABLE nominas ENABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE capacidad_rys ENABLE ROW LEVEL SECURITY;');
    console.log('RLS enabled.');
  }
  await client.end();
}
run();
