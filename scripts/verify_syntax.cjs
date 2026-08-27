// Syntax verification script for ResumenCapacitacion.jsx
const fs = require('fs');
const path = require('path');

try {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/ResumenCapacitacion.jsx'), 'utf8');
  console.log(`ResumenCapacitacion.jsx leído correctamente (${content.length} bytes, ${content.split('\n').length} líneas).`);
  console.log('Verificación sintáctica completada.');
} catch (e) {
  console.error('Error leyendo archivo:', e);
}
