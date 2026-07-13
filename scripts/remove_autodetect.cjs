const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// For Periodo
content = content.replace(
  /<option value="">\(Todos\)<\/option>/,
  '<option value="" disabled>Seleccione Período</option>'
);

// For Segmento
content = content.replace(
  /<option value="">\(Autodetectar\)<\/option>/,
  '<option value="" disabled>Seleccione Segmento</option>'
);

// For Campana
content = content.replace(
  /<option value="">\(Autodetectar\)<\/option>/,
  '<option value="" disabled>Seleccione Campaña</option>'
);

// For Grupo
content = content.replace(
  /<option value="">\(Autodetectar\)<\/option>/,
  '<option value="" disabled>Seleccione Grupo (GPE)</option>'
);

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Removed Autodetectar from NominaForm.jsx filters!');
