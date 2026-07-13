import { insertPostulante } from './src/lib/dataService.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// We need to bypass vite environment loading for test script:
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
globalThis.supabase = supabase; // mock if needed

async function test() {
  try {
    const payload = {
      documento: '74121789',
      tipo_documento: 'DNI',
      apellido_paterno: 'AREVALO',
      apellido_materno: 'OBESO',
      nombres: 'RENATO SEBASTIAN',
      celular: '953375330',
      celular_referencia: '953375330',
      correo: 'renatoarevalo12@gmail.com',
      genero: 'MASCULINO',
      fecha_nacimiento: '2003-04-15',
      edad: 23,
      estado_civil: 'SOLTERO',
      n_hijos: 0,
      nivel_academico: 'UNIVERSITARIO TRUNCO',
      carrera: 'NUTRICION',
      nacionalidad: 'PERUANA',
      lugar_residencia: 'PROVINCIA',
      distrito_residencia: 'CHEPEN, LA LIBERTAD',
      direccion_domicilio: 'LAS MORAS 170',
      exp_call_center: true,
      exp_tipo_campana: 'EXPERIENCIA ATC CALL CENTER',
      exp_tiempo_campana: '3 - 6 MESES',
      reclutador: 'HOYOS PONCE ANA',
      sede: 'COMAS',
      campana: 'CONTACTADOS',
      grupo_codigo: 'GPE-2026031',
      modalidad: 'REMOTO',
      condicion: 'FULL TIME',
      horario_gestion: '12:00 - 21:00',
      descanso: 'ROTATIVO'
    };
    const res = await insertPostulante(payload);
    console.log('Success:', res.documento);
  } catch (err) {
    console.error('FAILED:', err.message);
  }
  process.exit();
}
test();
