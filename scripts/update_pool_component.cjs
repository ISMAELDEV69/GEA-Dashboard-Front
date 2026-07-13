const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaFormPool.jsx', 'utf8');

// Add props
content = content.replace(
  /bulkPeriodo, bulkSegmento, bulkCampana, bulkGrupo, reclutador/,
  "bulkPeriodo, bulkSegmento, bulkCampana, bulkGrupo, bulkSede, reclutador, grupos = []"
)

// Update state
content = content.replace(
  /const \[existingDocs, setExistingDocs\] = useState\(new Set\(\)\)/,
  "const [existingDocs, setExistingDocs] = useState(new Map())"
)

// Update loadPool
content = content.replace(
  /const docSet = new Set\(\(existing \|\| \[\]\)\.map\(r => r\.documento\)\)/,
  "const docMap = new Map((existing || []).map(r => [r.documento, r.grupo_codigo]))"
)
content = content.replace(
  /setExistingDocs\(docSet\)/,
  "setExistingDocs(docMap)"
)

// Update existingDocs lookup
content = content.replace(
  /existingDocs\.has\(/g,
  "existingDocs.has("
)

// Show all data instead of filtering out existing
content = content.replace(
  /let list = poolData\.filter\(d => d\.documento && !existingDocs\.has\(d\.documento\)\)/,
  "let list = poolData.filter(d => d.documento)"
)

// Update handleSave validation
content = content.replace(
  /if \(!bulkPeriodo \|\| !bulkSegmento \|\| !bulkCampana \|\| !bulkGrupo\) \{/,
  "if (!bulkPeriodo || !bulkSegmento || !bulkCampana || !bulkGrupo || !bulkSede) {"
)
content = content.replace(
  /Error\('Debes seleccionar Periodo, Segmento, Campaña y Grupo/,
  "Error('Debes seleccionar Periodo, Segmento, Campaña, Grupo y Sede"
)

// Inject true periodo and semana
content = content.replace(
  /periodo_reclutado: bulkPeriodo,/,
  "periodo_reclutado: (grupos.find(g => g.grupo_codigo === bulkGrupo)?.periodo) || bulkPeriodo,"
)
content = content.replace(
  /semana_trabajo: parseInt\(bulkPeriodo\.slice\(-2\)\) \|\| null,/,
  "semana_trabajo: parseInt((grupos.find(g => g.grupo_codigo === bulkGrupo)?.semana_label || '').replace(/\\D/g, '')) || null,\n          sede: bulkSede,"
)

// Update nextExisting
content = content.replace(
  /const nextExisting = new Set\(existingDocs\)/,
  "const nextExisting = new Map(existingDocs)"
)
content = content.replace(
  /nextExisting\.add\(d\.documento\)/,
  "nextExisting.set(d.documento, bulkGrupo)"
)

// Update UI rendering to show disabled rows
content = content.replace(
  /hover:bg-slate-50 dark:hover:bg-slate-800\/50 cursor-pointer \$\{selectedDocs\.has\(d\.documento\) \? 'bg-blue-50 dark:bg-blue-900\/20' : ''\}/,
  "hover:bg-slate-50 dark:hover:bg-slate-800/50 ${existingDocs.has(d.documento) ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/80' : 'cursor-pointer'} ${selectedDocs.has(d.documento) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
)

content = content.replace(
  /onClick=\{[^\}]+\}/,
  "onClick={() => { if (!existingDocs.has(d.documento)) toggleSelect(d.documento) }}"
)

content = content.replace(
  /<td className="p-3 text-slate-700 dark:text-slate-300 font-medium">\{d\.documento\}<\/td>/,
  `<td className="p-3 text-slate-700 dark:text-slate-300 font-medium">
                    {d.documento}
                    {existingDocs.has(d.documento) && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Asignado: {existingDocs.get(d.documento)}</span>
                    )}
                  </td>`
)

fs.writeFileSync('src/components/nomina/NominaFormPool.jsx', content);
console.log('NominaFormPool updated!');
