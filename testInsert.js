import { insertPostulante } from './src/lib/dataService.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

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
      fecha_nacimiento: '2003-04-15', // example
      edad: 23,
      estado_civil: 'SOLTERO',
      hijos: 0,
      nivel_educativo: 'UNIVERSITARIO TRUNCO',
      profesion: 'NUTRICION',
      nacionalidad: 'PERUANA',
      residencia: 'PROVINCIA',
      distrito: 'CHEPEN, LA LIBERTAD',
      direccion: 'LAS MORAS 170',
      experiencia_callcenter: 'SI',
      experiencia_tipo: 'EXPERIENCIA ATC CALL CENTER',
      experiencia_tiempo: '3 - 6 MESES',
      reclutador: 'HOYOS PONCE ANA',
      sede: 'COMAS',
      campana: 'CONTACTADOS',
      grupo_codigo: 'GPE-2026031'
    };
    const res = await insertPostulante(payload);
    console.log('Success:', res.documento);
  } catch (err) {
    console.error('FAILED:', err.message);
  }
  process.exit();
}
test();
