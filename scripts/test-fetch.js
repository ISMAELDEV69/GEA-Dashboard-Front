import fs from 'fs'

const envStr = fs.readFileSync('.env.local', 'utf8')
let url, key;
for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1]
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1]
}

import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)

async function run() {
    const { data, error } = await supabase
      .from('consolidado_asistencias')
      .select('fecha_registro_asistencia')
      .limit(5)
    
    data.forEach(row => {
      let isoDate = '';
      if (row.fecha_registro_asistencia) {
        const parts = row.fecha_registro_asistencia.split('/');
        if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      console.log('Original:', row.fecha_registro_asistencia, 'Parsed:', isoDate)
    })
}
run()
