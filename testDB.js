import { Client } from 'pg';
import fs from 'fs';
const cs = fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const c = new Client({connectionString:cs,ssl:{rejectUnauthorized:false}});

async function test() {
  await c.connect();
  try {
    const p_data = {
      documento: "74121789",
      tipo_documento: "DNI",
      apellido_paterno: "AREVALO",
      apellido_materno: "OBESO",
      nombres: "RENATO SEBASTIAN",
      celular: "953375330",
      correo: "renatoarevalo12@gmail.com",
      genero: "MASCULINO",
      fecha_nacimiento: "2003-04-15",
      estado_civil: "SOLTERO",
      n_hijos: 0,
      nivel_academico: "UNIVERSITARIO TRUNCO",
      carrera: "NUTRICION",
      nacionalidad: "PERUANA",
      lugar_residencia: "PROVINCIA",
      distrito_residencia: "CHEPEN, LA LIBERTAD",
      direccion_domicilio: "LAS MORAS 170",
      exp_call_center: true,
      exp_tipo_campana: "EXPERIENCIA ATC CALL CENTER",
      exp_tiempo_campana: "3 - 6 MESES",
      reclutador_id: 8, // HOYOS PONCE ANA
      sede_id: 3,       // COMAS
      campana_id: 3,    // CONTACTADOS
      grupo_codigo: "GPE-2026031",
      modalidad: "REMOTO",
      condicion: "FULL TIME",
      horario_gestion: "12:00 - 21:00",
      descanso: "ROTATIVO",
      estado: "APROBADO",
      status_dia_1: "APTO",
      periodo_reclutado: "202604",
      semana_trabajo: 17
    };
    const res = await c.query('SELECT registrar_nomina($1::jsonb)', [p_data]);
    console.log('SUCCESS:', res.rows);
  } catch (err) {
    console.error('SQL ERROR:', err.message);
  }
  await c.end();
}
test();
