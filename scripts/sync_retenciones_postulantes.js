import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://lqvvhovfvwzaprdgdobc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || 'sb_secret_yFPHoSad3S_sFm-wKmCm3A_oauamLbk' || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hqkYCTr8g29RzFZnXiho5Q_7QAGdUKg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function sync() {
  console.log('🔄 Sincronizando postulantes a la tabla postulantes...')
  const { data: nominasList, error } = await supabase
    .from('nominas')
    .select('documento, tipo_documento, nombres, apellido_paterno, apellido_materno, celular, correo, fecha_nacimiento, genero, direccion_domicilio, grupo_codigo')
    .in('grupo_codigo', ['GPE-2026012-1', 'GPE-2026012-2', 'GPE-2026013'])

  if (error) {
    console.error('Error fetching nominas:', error.message)
    return
  }

  console.log(`Encontrados ${nominasList.length} postulantes en nominas para estos 3 grupos.`)

  const postulantesPayload = nominasList.map(n => ({
    documento: n.documento,
    tipo_documento: n.tipo_documento || 'DNI',
    nombres: n.nombres,
    apellido_paterno: n.apellido_paterno,
    apellido_materno: n.apellido_materno,
    celular: n.celular,
    correo: n.correo,
    fecha_nacimiento: n.fecha_nacimiento,
    genero: n.genero,
    direccion: n.direccion_domicilio,
    estado_postulante: 'ACTIVO'
  }))

  const { error: errPost } = await supabase
    .from('postulantes')
    .upsert(postulantesPayload, { onConflict: 'documento' })

  if (errPost) {
    console.error('Error upserting postulantes:', errPost.message)
  } else {
    console.log(`✅ ${postulantesPayload.length} postulantes sincronizados en la tabla postulantes.`)
  }
}

sync().catch(console.error)
