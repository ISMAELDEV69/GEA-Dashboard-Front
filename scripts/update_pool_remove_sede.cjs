const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaFormPool.jsx', 'utf8');

// Remove bulkSede from props
content = content.replace(
  /bulkPeriodo, bulkSegmento, bulkCampana, bulkGrupo, bulkSede, reclutador, grupos = \[\]/,
  "bulkPeriodo, bulkSegmento, bulkCampana, bulkGrupo, reclutador, grupos = []"
)

// Remove bulkSede from validation
content = content.replace(
  /if \(!bulkPeriodo \|\| !bulkSegmento \|\| !bulkCampana \|\| !bulkGrupo \|\| !bulkSede\) \{/,
  "if (!bulkPeriodo || !bulkSegmento || !bulkCampana || !bulkGrupo) {"
)

// Remove bulkSede from Error message
content = content.replace(
  /Error\('Debes seleccionar Periodo, Segmento, Campaña, Grupo y Sede'\)/,
  "Error('Debes seleccionar Periodo, Segmento, Campaña y Grupo')"
)

// Remove sede injection
content = content.replace(
  /semana_trabajo: parseInt\(\(grupos.find\(g => g\.grupo_codigo === bulkGrupo\)\?.semana_label \|\| ''\).replace\(\/\\D\/g, ''\)\) \|\| null,\n\s*sede: bulkSede,/,
  "semana_trabajo: parseInt((grupos.find(g => g.grupo_codigo === bulkGrupo)?.semana_label || '').replace(/\\D/g, '')) || null,"
)

fs.writeFileSync('src/components/nomina/NominaFormPool.jsx', content);
console.log('Removed Sede from NominaFormPool');
