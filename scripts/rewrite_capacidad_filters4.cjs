const fs = require('fs');
let content = fs.readFileSync('src/components/CapacidadRys.jsx', 'utf8');

content = content.replace(
  /return Array\.from\(new Set\(gruposEnriquecidos\.map\(c => c\?\.campana\)\.filter\(Boolean\)\)\)\.sort\(\)/,
  "return ['TODOS', ...Array.from(new Set(gruposEnriquecidos.map(c => c?.campana).filter(Boolean))).sort()]"
);

fs.writeFileSync('src/components/CapacidadRys.jsx', content);
