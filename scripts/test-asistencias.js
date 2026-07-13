import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1]
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1]
}

const supabase = createClient(url, key)

async function run() {
  const { data, error } = await supabase
    .from('consolidado_asistencias')
    .select('codigo_grupo, fecha_registro_asistencia')
    .limit(5)
  console.log(data)
}
run()
