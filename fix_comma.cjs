const fs = require('fs');
const file = 'src/components/nomina/NominaGridEditor.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /{ key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: \['COMPLETO', 'PENDIENTE'\] }/,
  "{ key: 'status_final', label: 'STATUS FINAL', width: 120, type: 'select', options: ['COMPLETO', 'PENDIENTE'] },"
);

fs.writeFileSync(file, content);
console.log('Fixed comma');
