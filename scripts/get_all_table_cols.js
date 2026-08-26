import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function getColumns() {
  const tables = [
    'perfiles',
    'consolidado_asistencias',
    'capacidad_rys',
    'nominas',
    'formadores',
    'equipo_reclutamiento',
    'grupos_dia1',
    'descuentos',
    'config_roles'
  ]

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1)
    if (error) {
      console.log(`Tabla ${t}: ERROR -> ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`Tabla ${t}: OK -> [${Object.keys(data[0]).join(', ')}]`)
    } else {
      // Intentar insertar un dummy rollback o select con error para ver columnas
      console.log(`Tabla ${t}: Vacía (0 registros)`)
    }
  }
}

getColumns()
