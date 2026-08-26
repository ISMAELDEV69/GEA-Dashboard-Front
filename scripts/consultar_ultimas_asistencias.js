import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function consultarDetalle() {
  console.log('='.repeat(80))
  console.log('📋 AUDITORÍA: ÚLTIMAS OPERACIONES DE ASISTENCIA REGISTRADAS DESDE LA WEB')
  console.log('='.repeat(80))

  // 1. Audit Logs
  const { data: audit, error: errAudit } = await supabase
    .from('audit_logs')
    .select('id, tabla_afectada, operacion, id_registro, usuario_email, fecha, valores_nuevos')
    .order('fecha', { ascending: false })
    .limit(15)

  if (errAudit) {
    console.log('Error audit_logs:', errAudit.message)
  } else {
    console.log('\n1. Últimos registros en audit_logs (acciones de usuarios web):')
    console.table(audit.map(r => ({
      Fecha: r.fecha,
      Usuario: r.usuario_email,
      Tabla: r.tabla_afectada,
      Operación: r.operacion,
      ID_Registro: r.id_registro
    })))
  }

  // 2. Consolidado de Asistencias más recientes por created_at
  const { data: consolidado } = await supabase
    .from('consolidado_asistencias')
    .select('id, codigo_grupo, campana, documento, apellido_paterno, apellido_materno, nombres, fecha_registro_asistencia, sigla, estado, motivo_baja, nombre_formador, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  console.log('\n2. Últimos registros en consolidado_asistencias:')
  console.table(consolidado.map(r => ({
    Grupo: r.codigo_grupo,
    Campaña: r.campana,
    DNI: r.documento,
    Nombres: `${r.apellido_paterno || ''} ${r.apellido_materno || ''}, ${r.nombres || ''}`.trim(),
    Fecha_Asistencia: r.fecha_registro_asistencia,
    Sigla: r.sigla,
    Estado: r.estado,
    Motivo_Baja: r.motivo_baja || '-',
    Formador: r.nombre_formador || '-',
    Registrado_En: r.created_at
  })))
}

consultarDetalle().catch(console.error)
