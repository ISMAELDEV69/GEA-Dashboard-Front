import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ujqehcpglfhnytzsyedp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function eliminarFeriado() {
  console.log('='.repeat(70))
  console.log('🗑️ INICIANDO ELIMINACIÓN DE REGISTROS DEL FERIADO 6/8/2026')
  console.log('='.repeat(70))

  // 1. Verificar registros antes de borrar
  const { data: antes, error: errAntes } = await supabase
    .from('consolidado_asistencias')
    .select('id, documento, nombres, apellido_paterno, fecha_registro_asistencia, codigo_grupo, campana')
    .eq('codigo_grupo', 'GPE-2026013')
    .eq('fecha_registro_asistencia', '6/8/2026')

  if (errAntes) {
    console.error('Error al consultar antes:', errAntes)
    return
  }

  console.log(`Registros encontrados para eliminar: ${antes.length}`)

  // 2. Ejecutar DELETE
  const { data: deleted, error: errDel } = await supabase
    .from('consolidado_asistencias')
    .delete()
    .eq('codigo_grupo', 'GPE-2026013')
    .eq('fecha_registro_asistencia', '6/8/2026')
    .select()

  if (errDel) {
    console.error('Error al eliminar:', errDel)
    return
  }

  console.log(`✅ Registros eliminados exitosamente: ${deleted?.length || antes.length}`)

  // 3. Confirmar que ya no existen registros para el 6/8/2026
  const { data: despues, error: errDesp } = await supabase
    .from('consolidado_asistencias')
    .select('id')
    .eq('codigo_grupo', 'GPE-2026013')
    .eq('fecha_registro_asistencia', '6/8/2026')

  console.log(`Registros restantes del 6/8/2026 en GPE-2026013: ${despues?.length || 0}`)

  // 4. Mostrar cómo quedaron las demás fechas del grupo
  const { data: fechasRestantes } = await supabase
    .from('consolidado_asistencias')
    .select('fecha_registro_asistencia')
    .eq('codigo_grupo', 'GPE-2026013')

  const summary = {}
  fechasRestantes?.forEach(r => {
    summary[r.fecha_registro_asistencia] = (summary[r.fecha_registro_asistencia] || 0) + 1
  })

  console.log('\n📊 Fechas de asistencia activas para GPE-2026013:')
  console.table(Object.entries(summary).map(([fecha, cant]) => ({ 'Fecha Asistencia': fecha, 'Cantidad Postulantes': cant })))
}

eliminarFeriado()
