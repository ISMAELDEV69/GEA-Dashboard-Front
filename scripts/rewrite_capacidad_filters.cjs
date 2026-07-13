const fs = require('fs');

let content = fs.readFileSync('src/components/CapacidadRys.jsx', 'utf8');

// Replace campanaOptions and segmentoOptions
content = content.replace(
  /const campanaOptions = useMemo\(\(\) => \{\s*return Array\.from\(new Set\(campanas\.map\(c => c\?\.nombre \|\| c\)\.filter\(Boolean\)\)\)\.sort\(\)\s*\}, \[campanas\]\)/g,
  `const campanaOptions = useMemo(() => {
    return Array.from(new Set(gruposEnriquecidos.map(c => c?.campana).filter(Boolean))).sort()
  }, [gruposEnriquecidos])`
);

content = content.replace(
  /const segmentoOptions = useMemo\(\(\) => \{\s*return Array\.from\(new Set\(campanas\.map\(c => c\?\.segmento\)\.filter\(Boolean\)\)\)\.sort\(\)\s*\}, \[campanas\]\)/g,
  `const segmentoOptions = useMemo(() => {
    return Array.from(new Set(gruposEnriquecidos.map(c => c?.segmento).filter(Boolean))).sort()
  }, [gruposEnriquecidos])`
);

fs.writeFileSync('src/components/CapacidadRys.jsx', content);
console.log('Fixed CapacidadRys.jsx filters!');
