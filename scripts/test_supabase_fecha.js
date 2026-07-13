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
  const { data } = await supabase.from('grupos_dia1').select('fecha_dia1').eq('grupo_id', 'd13d62ab-c0e2-4875-b1f7-77d04f998ff2').limit(1).single()
  console.log("Supabase returned:", data.fecha_dia1)
  console.log("Type:", typeof data.fecha_dia1)
}
run()
