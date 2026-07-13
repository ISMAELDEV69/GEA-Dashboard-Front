const fs = require('fs');
const file = 'src/components/nomina/NominaGridEditor.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace EDITABLE_COLUMNS
const regexColumns = /const EDITABLE_COLUMNS = \[[\s\S]*?\]/;
const newColumns = `const EDITABLE_COLUMNS = [
  { key: 'sede', label: 'SEDE', width: 150, type: 'select', options: ['ATE', 'SAN ISIDRO', 'COMAS', 'JOCKEY'] },
  { key: 'modalidad', label: 'MODALIDAD', width: 120, type: 'select', options: ['PRESENCIAL', 'HIBRIDO', 'REMOTO'] },
  { key: 'condicion', label: 'CONDICIÓN', width: 120, type: 'select', options: ['FULL TIME', 'PART TIME'] },
  { key: 'horario_gestion', label: 'HORARIO DE GESTIÓN', width: 150 },
  { key: 'descanso', label: 'DESCANSO', width: 100 },
  { key: 'envio_dni', label: 'ENVÍO DNI', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'test_psicologico', label: 'TEST PSICO.', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'validacion_pc', label: 'VALID. PC', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'evaluacion_dia_0', label: 'EVAL. DÍA 0', width: 120, type: 'select', options: ['SI', '-', 'PENDIENTE'] },
  { key: 'fecha_inicio_capacitacion', label: 'INICIO CAPA.', width: 120, type: 'date' },
  { key: 'fecha_fin_capacitacion', label: 'FIN CAPA.', width: 120, type: 'date' },
  { key: 'fecha_conexion_ojt', label: 'CONEXIÓN OJT', width: 120, type: 'date' },
  { key: 'fecha_conexion_op', label: 'CONEXIÓN OP', width: 120, type: 'date' },
  { key: 'pago_capacitacion', label: 'PAGO CAPA.', width: 100 },
  { key: 'tipo_contratacion', label: 'TIPO CONTRATACIÓN', width: 150 },
  { key: 'razon_social', label: 'RAZÓN SOCIAL', width: 150, type: 'select', options: ['GEA', 'SET'] },
  { key: 'remuneracion', label: 'REMUNERACIÓN', width: 120, type: 'number' },
  { key: 'bono_variable', label: 'BONO VARIABLE', width: 120, type: 'number' },
  { key: 'bono_movilidad', label: 'BONO MOVILIDAD', width: 120, type: 'number' },
  { key: 'bono_bienvenida', label: 'BONO BIENVENIDA', width: 120, type: 'number' },
  { key: 'bono_permanencia', label: 'BONO PERMANENCIA', width: 120, type: 'number' },
  { key: 'bono_asistencia_perfecta', label: 'BONO ASIST. PERF.', width: 120, type: 'number' },
  { key: 'cargo_contractual', label: 'CARGO CONTRACTUAL', width: 200, type: 'select', options: ['AGENTE TMK OUTBOUND', 'AGENTE TMK INBOUND', 'AGENTE TMK RETENCIONES'] },
  { key: 'dia_0', label: 'DÍA 0', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_0_obs', label: 'OBSERVACIONES DÍA 0', width: 200 },
  { key: 'status_dia_1', label: 'STATUS DÍA 1', width: 120, type: 'select', options: ['APTO', 'RECUPERADO', 'AGREGADO', 'CESE', 'OBSERVADO'] },
  { key: 'dia_1', label: 'DÍA 1', width: 120, type: 'select', options: ['ASISTIO', 'FALTA'] },
  { key: 'dia_1_obs', label: 'OBSERVACIONES DÍA 1', width: 200 },
  { key: 'evaluar', label: 'EVALUAR', width: 150, type: 'select', options: ['APROBADO', 'DESAPROBADO', 'NO DA EVALUAR', 'NO LE LLEGA EL CORREO', 'SIN STATUS', 'DESAPRUEBA Y DA SEGUNDO EVALUAR'] },
  { key: 'obs_evaluar', label: 'OBS. EVALUAR', width: 200 },
  { key: 'doc_cv', label: 'CV', width: 80 },
  { key: 'doc_dni_adjunto', label: 'DNI (ADJUNTO)', width: 120 },
  { key: 'doc_certijoven', label: 'CERTIJOVEN', width: 120 },
  { key: 'doc_recibo_servicios', label: 'RECIBO SERV.', width: 120 },
  { key: 'doc_ficha_datos', label: 'FICHA DATOS', width: 120 },
  { key: 'doc_autorizacion', label: 'AUTORIZACIÓN', width: 120 },
  { key: 'status_final', label: 'STATUS FINAL', width: 120 },
  { key: 'observacion_final', label: 'OBS. FINAL', width: 200 }
]`;

content = content.replace(regexColumns, newColumns);

const regexInput = /<input\s+type=\{col\.type \|\| 'text'\}([\s\S]*?)placeholder="\.\.\."\s*\/>/;

const newInput = `{col.type === 'select' ? (
                        <select
                          value={row[col.key] || ''}
                          onChange={e => setData(prev => prev.map(r => r.documento === row.documento ? { ...r, [col.key]: e.target.value } : r))}
                          onBlur={e => handleCellChange(row.documento, col.key, e.target.value)}
                          className={\`w-full h-full p-2 bg-transparent text-slate-800 dark:text-slate-100 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none transition-colors \${!row[col.key] && col.key.includes('status') ? 'bg-red-50/50 dark:bg-red-900/10' : ''}\`}
                        >
                          <option value=""></option>
                          {col.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          type={col.type || 'text'}
                          value={row[col.key] || ''}
                          onChange={e => setData(prev => prev.map(r => r.documento === row.documento ? { ...r, [col.key]: e.target.value } : r))}
                          onBlur={e => handleCellChange(row.documento, col.key, e.target.value)}
                          className={\`w-full h-full p-2 bg-transparent text-slate-800 dark:text-slate-100 border-none focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none transition-colors \${!row[col.key] && col.key.includes('status') ? 'bg-red-50/50 dark:bg-red-900/10' : ''}\`}
                          placeholder="..."
                        />
                      )}`;

content = content.replace(regexInput, newInput);
fs.writeFileSync(file, content);
console.log('Fixed NominaGridEditor.jsx');
