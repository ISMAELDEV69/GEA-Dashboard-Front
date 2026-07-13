const fs = require('fs');

let content = fs.readFileSync('src/lib/nominaConsolidadoSchema.js', 'utf8');

// Add marca_temporal to fields
content = content.replace(
  /'periodo_reclutado', 'semana_trabajo',/,
  "'marca_temporal', 'periodo_reclutado', 'semana_trabajo',"
)

// Map it. It's usually the first column if it's "Marca temporal"
content = content.replace(
  /const colIdx = \{\}/,
  "const colIdx = {}"
)
content = content.replace(
  /if \(h\.includes\('PERIODO RECLUTADO'\)\)/,
  "if (h.includes('MARCA TEMPORAL') || h.includes('TIMESTAMP')) colIdx['marca_temporal'] = i\n    else if (h.includes('PERIODO RECLUTADO'))"
)

// Also if it's not named but it's the first column (i=0) and it's a date... we can just use index 0 if Marca Temporal isn't found.
content = content.replace(
  /const colIdx = \{\}/,
  "const colIdx = { marca_temporal: 0 }"
)

content = content.replace(
  /periodo_reclutado: str\('periodo_reclutado'\),/,
  "marca_temporal: str('marca_temporal'),\n    periodo_reclutado: str('periodo_reclutado'),"
)

fs.writeFileSync('src/lib/nominaConsolidadoSchema.js', content);
console.log('Parser updated with marca_temporal');
