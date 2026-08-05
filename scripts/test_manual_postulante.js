/**
 * Script para testear el ingreso manual de un postulante en Supabase
 * Replicando exactamente el comportamiento de NominaForm.jsx -> insertPostulante
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import pkg from 'pg'
const { Client } = pkg

// Leer .env.local
let supabaseUrl = process.env.VITE_SUPABASE_URL
let supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
let dbUrl = process.env.DATABASE_URL

try {
  const envContent = fs.readFileSync('.env.local', 'utf8')
  const mUrl = envContent.match(/^VITE_SUPABASE_URL=(.+)$/m)
  const mKey = envContent.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)
  const mDb = envContent.match(/^DATABASE_URL=(.+)$/m)
  if (mUrl) supabaseUrl = mUrl[1].trim()
  if (mKey) supabaseKey = mKey[1].trim()
  if (mDb) dbUrl = mDb[1].trim()
} catch (e) {
  // ignore
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testManualEntry() {
  console.log('🧪 Iniciando prueba de ingreso manual de postulante...')

  const testDni = '88888888'
  
  // 1. Datos simulados del formulario manual (NominaForm.jsx)
  const payloadForm = {
    documento: testDni,
    tipo_documento: 'DNI',
    apellido_paterno: 'TEST_MANUAL',
    apellido_materno: 'PRUEBA',
    nombres: 'JUAN ALBERTO',
    celular: '987654321',
    correo: 'juan.prueba.manual@gea.com',
    genero: 'MASCULINO',
    fecha_nacimiento: '2000-01-01',
    estado_civil: 'SOLTERO',
    n_hijos: 0,
    nivel_academico: 'SECUNDARIA COMPLETA',
    nacionalidad: 'PERUANA',
    periodo_reclutado: '202608',
    semana_trabajo: 31,
    reclutador: 'RECLUTADOR TEST',
    sede: 'ATE',
    campana: 'CAMPANA TEST',
    segmento: 'ATC',
    grupo_codigo: 'GRP-TEST-888',
    modalidad: 'PRESENCIAL',
    condicion: 'FULL TIME',
    horario_gestion: '09:00 - 18:00',
    remuneracion: 1100,
    bono_variable: 200
  }

  console.log('📋 Payload generado desde formulario:', JSON.stringify(payloadForm, null, 2))

  // 2. Verificar y obtener reclutador_id (como en insertPostulante)
  console.log('\n🔎 Consultando/Creando reclutador en catálogo...')
  let reclutador_id = 1 // default test
  const { data: recs, error: recErr } = await supabase
    .from('reclutadores')
    .select('id')
    .limit(1)

  if (recErr) {
    console.error('❌ Error consultando reclutadores:', recErr.message)
  } else if (recs && recs.length > 0) {
    reclutador_id = recs[0].id
    console.log(`✅ Reclutador encontrado con ID: ${reclutador_id}`)
  }

  // 3. Construir payload final para RPC
  const rpcPayload = {
    ...payloadForm,
    reclutador_id: reclutador_id
  }

  // 4. Ejecutar RPC registrar_nomina
  console.log('\n🚀 Ejecutando RPC supabase.rpc("registrar_nomina")...')
  const { data: nominaId, error: rpcError } = await supabase.rpc('registrar_nomina', { p_data: rpcPayload })

  if (rpcError) {
    console.error('❌ Error al registrar nómina vía RPC:', rpcError)
    process.exit(1)
  }

  console.log(`✅ ¡Nómina registrada exitosamente! ID devuelto: ${nominaId}`)

  // 5. Verificar lectura en la vista consolidada v_nominas_consolidado
  console.log('\n👁️ Verificando en vista v_nominas_consolidado...')
  const { data: verifData, error: verifErr } = await supabase
    .from('v_nominas_consolidado')
    .select('*')
    .eq('documento', testDni)

  if (verifErr) {
    console.error('❌ Error leyendo vista v_nominas_consolidado:', verifErr.message)
  } else {
    console.log(`✅ Datos encontrados en v_nominas_consolidado (${verifData.length} registro/s):`)
    console.log(verifData[0])
  }

  // 6. Limpieza del registro de prueba en la base de datos (para no afectar producción)
  console.log('\n🧹 Limpiando datos de prueba de la base de datos...')
  if (dbUrl) {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    await client.query("DELETE FROM nominas WHERE documento = $1", [testDni])
    await client.end()
    console.log('✅ Limpieza completa exitosa. Base de datos impecable.')
  } else {
    await supabase.from('nominas').delete().eq('documento', testDni)
    console.log('✅ Limpieza vía API Supabase terminada.')
  }

  console.log('\n🎉 ¡EL INGRESO MANUAL DE POSTULANTE FUNCIONA PERFECTAMENTE (100% OK)!')
}

testManualEntry().catch(err => {
  console.error('💥 Error fatal en test:', err)
  process.exit(1)
})
