const fs = require('fs');

const files = ['src/components/NominaForm.jsx', 'src/pages/NominaCompletar.jsx'];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Fix bulkPeriodos map
  content = content.replace(
    /grupos\.map\(g => g\.periodo \|\| g\.periodo\)/g,
    "grupos.map(g => g.periodo ? String(g.periodo) : null)"
  );
  
  // Fix Segmentos filter
  content = content.replace(
    /if \(bulkPeriodo\) filtered = filtered\.filter\(g => \(g\.periodo \|\| g\.periodo\) === bulkPeriodo\)/g,
    "if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo) === String(bulkPeriodo))"
  );
  
  // Fix Campanas filter
  content = content.replace(
    /if \(bulkSegmento\) filtered = filtered\.filter\(g => g\.segmento === bulkSegmento\)/g,
    "if (bulkSegmento) filtered = filtered.filter(g => String(g.segmento) === String(bulkSegmento))"
  );
  
  // Fix Grupos filter
  content = content.replace(
    /if \(bulkCampana\) filtered = filtered\.filter\(g => g\.campana === bulkCampana\)/g,
    "if (bulkCampana) filtered = filtered.filter(g => String(g.campana) === String(bulkCampana))"
  );
  
  // Also clean up the filter for 'g.periodo || g.periodo'
  content = content.replace(/grupos\.filter\(g => g\.periodo \|\| g\.periodo\)/g, "grupos.filter(g => g.periodo)");

  fs.writeFileSync(file, content);
  console.log('Fixed cascade in', file);
});
