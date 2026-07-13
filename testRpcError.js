import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const p_data = {
    "documento": "74121789",
    "tipo_documento": "DNI",
    "apellido_paterno": "AREVALO",
    "apellido_materno": "OBESO",
    "nombres": "RENATO SEBASTIAN",
    "celular": "953375330",
    "celular_referencia": "953375330",
    "correo": "renatoarevalo12@gmail.com",
    "genero": "MASCULINO",
    "fecha_nacimiento": "2003-04-15",
    "estado_civil": "SOLTERO",
    "n_hijos": 0,
    "nivel_academico": "UNIVERSITARIO TRUNCO",
    "carrera": "NUTRICION",
    "nacionalidad": "PERUANA",
    "lugar_residencia": "PROVINCIA",
    "distrito_residencia": "CHEPEN, LA LIBERTAD",
    "direccion_domicilio": "LAS MORAS 170",
    "periodo_reclutado": "202604",
    "semana_trabajo": 17,
    "reclutador_id": 8,
    "sede_id": 3,
    "campana_id": 3,
    "exp_call_center": true,
    "exp_tipo_campana": "EXPERIENCIA ATC CALL CENTER",
    "exp_tiempo_campana": "3 - 6 MESES",
    "grupo_codigo": "GPE-2026031",
    "modalidad": "REMOTO",
    "condicion": "FULL TIME",
    "horario_gestion": "12:00 - 21:00",
    "descanso": "ROTATIVO",
    "remuneracion": 1200,
    "bono_variable": 300,
    "bono_bienvenida": 100,
    "bono_permanencia": 200,
    "cargo_contractual": "AGENTE TMK RETENCIONES",
    "dia_0": "2026-04-20",
    "status_dia_1": "APTO",
    "dia_1": "2026-04-21",
    "estado": "APROBADO"
  };

  const { data, error } = await supabase.rpc('registrar_nomina', { p_data });
  if (error) {
    console.error('SUPABASE RPC ERROR:', error);
  } else {
    console.log('SUCCESS:', data);
  }
}
test();
