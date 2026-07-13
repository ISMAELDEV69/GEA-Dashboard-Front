const fs = require('fs');

let content = fs.readFileSync('src/components/ConsolidadoPowerBI.jsx', 'utf8');

// Add segmento to Set population
content = content.replace(
  /if \(d\.campana\) campanas\.add\(d\.campana\);/,
  "if (d.campana) campanas.add(d.campana);\n      if (d.segmento) segmentos.add(d.segmento);"
);

// Add segmento to filter logic
content = content.replace(
  /if \(campana !== 'Todas' && d\.campana !== campana\) return;/,
  "if (campana !== 'Todas' && d.campana !== campana) return;\n      if (segmento !== 'Todas' && d.segmento !== segmento) return;"
);

// Add filterSede or others? No, only the ones mentioned.
fs.writeFileSync('src/components/ConsolidadoPowerBI.jsx', content);
console.log('Fixed ConsolidadoPowerBI.jsx filters!');
