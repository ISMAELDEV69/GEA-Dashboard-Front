const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

content = content.replace(/g\.campana_nombre/g, 'g.campana');
content = content.replace(/g\.grupo_codigo/g, 'g.codigo');

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Reverted NominaForm.jsx filters to use g.campana and g.codigo!');
