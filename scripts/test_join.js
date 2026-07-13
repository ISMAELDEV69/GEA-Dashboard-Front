import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
}

const supabase = createClient(url, key)

async function run() {
  const { data, count, error } = await supabase
     .from('asistencias_capacitacion')
     .select('*, grupos_capacitacion!inner(codigo)', { count: 'exact' })
     .eq('grupos_capacitacion.codigo', 'GPE-2026013')
     
  console.log("Count:", count, "Error:", error)
}
run()
