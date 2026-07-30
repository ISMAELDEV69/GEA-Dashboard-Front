import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const payload = {
    documento: '99999999',
    nombres_completos: 'TEST NOMBRES',
    apellido_paterno: 'TEST PAT',
    apellido_materno: 'TEST MAT',
    cargo: 'ANALISTA',
    estado: 'ACTIVO',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    fecha_cese: null,
    remuneracion_basica: 0,
    bono_movilidad: 0,
    pct_sodexo: 0,
    alix: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase.from('equipo_reclutamiento').insert([payload]).select()
  if (error) {
    console.error("ERROR:", error)
  } else {
    console.log("SUCCESS:", data)
    await supabase.from('equipo_reclutamiento').delete().eq('documento', '99999999')
  }
}
run()
