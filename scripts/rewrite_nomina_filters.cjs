const fs = require('fs');

let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

content = content.replace(
  /return \[\.\.\.new Set\(filtered\.map\(g => g\.campana\)\.filter\(Boolean\)\)\]\.sort\(\)/,
  "return [...new Set(filtered.map(g => g.campana_nombre).filter(Boolean))].sort()"
);

content = content.replace(
  /if \(bulkCampana\) filtered = filtered\.filter\(g => g\.campana === bulkCampana\)/,
  "if (bulkCampana) filtered = filtered.filter(g => g.campana_nombre === bulkCampana)"
);

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Fixed NominaForm.jsx group filters!');
