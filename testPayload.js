import * as XLSX from 'xlsx';
import { parseNominaRows } from './src/lib/nominaConsolidadoSchema.js';

const wb = XLSX.readFile('/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 });

const rows = parseNominaRows(matrix, {});
const payload = rows[0];

function buildNominaPayload(p, ids) {
  return {
    documento: p.documento,
    tipo_documento: p.tipo_documento || 'DNI',
    apellido_paterno: p.apellido_paterno,
    apellido_materno: p.apellido_materno,
    nombres: p.nombres,
    celular: p.celular,
    celular_referencia: p.celular_referencia || null,
    celular_emergencia: p.celular_emergencia || null,
    contacto_emergencia: p.contacto_emergencia || null,
    parentesco: p.parentesco || null,
    correo: p.correo,
    genero: p.genero,
    fecha_nacimiento: p.fecha_nacimiento,
    estado_civil: p.estado_civil,
    n_hijos: p.n_hijos ?? 0,
    nivel_academico: p.nivel_academico,
    carrera: p.carrera || null,
    entidad: p.entidad || null,
    nacionalidad: p.nacionalidad || 'PERUANA',
    lugar_nacimiento: p.lugar_nacimiento || null,
    lugar_residencia: p.lugar_residencia || null,
    distrito_residencia: p.distrito_residencia || null,
    direccion_domicilio: p.direccion_domicilio || null,
    periodo_reclutado: p.periodo_reclutado,
    semana_trabajo: p.semana_trabajo,
    reclutador_id: ids.reclutador_id,
    sede_id: ids.sede_id,
    campana_id: ids.campana_id,
    fuente_oferta: p.fuente_oferta || null,
    observacion_reclutamiento: p.observacion || p.observacion_reclutamiento || null,
    exp_call_center: p.exp_call_center ?? null,
    exp_tipo_campana: p.exp_tipo_campana || null,
    exp_tiempo_campana: p.exp_tiempo_campana || null,
    exp_otra: p.exp_otra || null,
    exp_tiempo_otra: p.exp_tiempo_otra || null,
    grupo_codigo: p.grupo_codigo || null,
    formador_documento: p.formador_documento || null,
    modalidad: p.modalidad || null,
    condicion: p.condicion || null,
    horario_gestion: p.horario_gestion || p.rango_horario || null,
    descanso: p.descanso || null,
    envio_dni: p.envio_dni || null,
    test_psicologico: p.test_psicologico || null,
    validacion_pc: p.validacion_pc || null,
    evaluacion_dia_0: p.evaluacion_dia_0 || null,
    fecha_inicio_capacitacion: p.fecha_inicio_capacitacion || null,
    fecha_fin_capacitacion: p.fecha_fin_capacitacion || null,
    fecha_conexion_ojt: p.fecha_conexion_ojt || null,
    fecha_conexion_op: p.fecha_conexion_op || null,
    pago_capacitacion: p.pago_capacitacion ?? null,
    fecha_inscripcion_curso: p.fecha_inscripcion_curso || null,
    fecha_ingreso: p.fecha_ingreso || null,
    tipo_trabajo: p.tipo_trabajo || null,
    tipo_contratacion: p.tipo_contratacion || null,
    razon_social: p.razon_social || null,
    rango_salarial: p.rango_salarial || null,
    remuneracion: p.remuneracion ?? null,
    bono_variable: p.bono_variable ?? null,
    bono_movilidad: p.bono_movilidad ?? null,
    bono_bienvenida: p.bono_bienvenida ?? null,
    bono_permanencia: p.bono_permanencia ?? null,
    bono_asistencia_perfecta: p.bono_asistencia_perfecta ?? null,
    cargo_contractual: p.cargo_contractual || null,
    dia_0: p.dia_0 || null,
    dia_0_obs: p.dia_0_obs || null,
    status_dia_1: p.status_dia_1 || null,
    dia_1: p.dia_1 || null,
    dia_1_obs: p.dia_1_obs || null,
    estado: p.estado || null,
  }
}

const nominaData = buildNominaPayload(payload, { reclutador_id: 1, sede_id: 1, campana_id: 1 });
console.log(JSON.stringify(nominaData, null, 2));

// Test via DB
import pg from 'pg';
import fs from 'fs';
const cs = process.env.DATABASE_URL || fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const c = new pg.Client({connectionString:cs,ssl:{rejectUnauthorized:false}});
await c.connect();
try {
  const res = await c.query('SELECT registrar_nomina($1::jsonb)', [nominaData]);
  console.log('SUCCESS:', res.rows);
} catch (err) {
  console.error('DB ERROR:', err.message);
}
await c.end();
