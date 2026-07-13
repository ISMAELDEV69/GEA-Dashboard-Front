const fs = require('fs');

let content = fs.readFileSync('src/lib/nominaConsolidadoSchema.js', 'utf8');

// Add edad to fields
content = content.replace(
  /'fecha_nacimiento', 'estado_civil',/,
  "'fecha_nacimiento', 'edad', 'estado_civil',"
)

// Add alias for EDAD
content = content.replace(
  /fecha_nacimiento: \['FECHA DE NACIMIENTO'\],/,
  "fecha_nacimiento: ['FECHA DE NACIMIENTO'],\n  edad: ['EDAD'],"
)

// Add mapping for EDAD
content = content.replace(
  /else if \(h\.includes\('FECHA DE NACIMIENTO'\)\) colIdx\['fecha_nacimiento'\] = i/,
  "else if (h.includes('FECHA DE NACIMIENTO')) colIdx['fecha_nacimiento'] = i\n    else if (h === 'EDAD' || h.includes('EDAD')) colIdx['edad'] = i"
)

// Add to parse
content = content.replace(
  /fecha_nacimiento: parseExcelDate\(get\('fecha_nacimiento'\)\),/,
  "fecha_nacimiento: parseExcelDate(get('fecha_nacimiento')),\n    edad: parseInt(get('edad')) || null,"
)

fs.writeFileSync('src/lib/nominaConsolidadoSchema.js', content);
console.log('Parser updated with EDAD');
