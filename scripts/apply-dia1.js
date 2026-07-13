import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
}

const supabase = createClient(url, key)
const sql = fs.readFileSync('database/dia1_schema.sql', 'utf8')

async function run() {
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
  for (const stmt of statements) {
    if (stmt.startsWith('--') && !stmt.includes('CREATE') && !stmt.includes('ALTER')) continue;
    const { error } = await supabase.rpc('exec_sql', { query: stmt })
    if (error) {
       console.log('Error o Advertencia (puede que ya exista la función exec_sql o no tengas permisos directos, pero no pasa nada, lo haré de otra forma):', error.message)
       break;
    }
  }
  console.log("Terminado.")
}
run()
