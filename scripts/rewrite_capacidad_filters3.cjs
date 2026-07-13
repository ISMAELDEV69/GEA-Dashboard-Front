const fs = require('fs');

let content = fs.readFileSync('src/components/CapacidadRys.jsx', 'utf8');

content = content.replace(
  /\{\s*value:\s*filterSegmento,\s*set:\s*setFilterSegmento,\s*options:\s*segmentos,\s*label:\s*'Segmento'\s*\}/,
  "{ value: filterSegmento, set: setFilterSegmento, options: segmentos, label: 'Segmento' },\n          { value: filterCampana, set: setFilterCampana, options: campanaOptions, label: 'Campaña' }"
);

fs.writeFileSync('src/components/CapacidadRys.jsx', content);
console.log('Fixed CapacidadRys.jsx campana filter array!');
