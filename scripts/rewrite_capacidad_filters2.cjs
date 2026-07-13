const fs = require('fs');

let content = fs.readFileSync('src/components/CapacidadRys.jsx', 'utf8');

// Add state for filterCampana
if (!content.includes('const [filterCampana')) {
  content = content.replace(
    /const \[filterEstado, setFilterEstado\] = useState\('TODOS'\)/,
    "const [filterEstado, setFilterEstado] = useState('TODOS')\n  const [filterCampana, setFilterCampana] = useState('TODOS')"
  );
}

// Add to filtered logic
if (!content.includes('filterCampana !== \'TODOS\'')) {
  content = content.replace(
    /if \(filterEstado !== 'TODOS' && g\.estado !== filterEstado\) return false/,
    "if (filterEstado !== 'TODOS' && g.estado !== filterEstado) return false\n      if (filterCampana !== 'TODOS' && g.campana !== filterCampana) return false"
  );
}

// Add to dependencies
content = content.replace(
  /\[gruposEnriquecidos, search, filterPeriodo, filterEstado, filterSegmento\]/,
  "[gruposEnriquecidos, search, filterPeriodo, filterEstado, filterSegmento, filterCampana]"
);

// Add to UI array
content = content.replace(
  /\{ value: filterSegmento, set: setFilterSegmento, options: segmentoOptions, label: 'Segmento' \},/,
  "{ value: filterSegmento, set: setFilterSegmento, options: segmentoOptions, label: 'Segmento' },\n            { value: filterCampana, set: setFilterCampana, options: campanaOptions, label: 'Campaña' },"
);

fs.writeFileSync('src/components/CapacidadRys.jsx', content);
console.log('Fixed CapacidadRys.jsx filters part 2!');
