const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaGridEditor.jsx', 'utf8');

content = content.replace(
  /const EDITABLE_COLUMNS = \[/,
  "const EDITABLE_COLUMNS = [\n  { key: 'sede', label: 'SEDE', width: 150 },"
)

fs.writeFileSync('src/components/nomina/NominaGridEditor.jsx', content);
console.log('Added Sede to NominaGridEditor');
