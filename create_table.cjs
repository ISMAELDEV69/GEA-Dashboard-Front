const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const query = `
create table if not exists dashboards_links (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  url text not null,
  roles jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar permisos para que se pueda leer/escribir desde la app
alter table dashboards_links enable row level security;

-- Permitir todo para propósitos prácticos de app anon
drop policy if exists "Permitir todo a anon (Dashboards)" on dashboards_links;
create policy "Permitir todo a anon (Dashboards)" on dashboards_links for all using (true);
`;

async function run() {
  try {
    await client.connect();
    console.log("Connected");
    await client.query(query);
    console.log("Table and policy created");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
