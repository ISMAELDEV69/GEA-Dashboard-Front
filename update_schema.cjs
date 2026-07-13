const fs = require('fs');
const file = 'src/lib/nominaConsolidadoSchema.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /'observacion_final'/,
  "'observacion_final', 'evaluar', 'obs_evaluar'"
);

fs.writeFileSync(file, content);
console.log('Updated schema');
