const fs = require('fs');

const files = ['src/components/NominaForm.jsx', 'src/pages/NominaCompletar.jsx'];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace bulkGruposList logic to ensure uniqueness and use trim()
  const regex = /const bulkGruposList = useMemo\(\(\) => \{[\s\S]*?return filtered[\s\S]*?\}, \[grupos, bulkPeriodo, bulkSegmento, bulkCampana\]\)/;
  
  const replacement = `const bulkGruposList = useMemo(() => {
    let filtered = grupos.filter(g => g.periodo);
    if (bulkPeriodo) filtered = filtered.filter(g => String(g.periodo).trim() === String(bulkPeriodo).trim());
    if (bulkSegmento) filtered = filtered.filter(g => String(g.segmento).trim() === String(bulkSegmento).trim());
    if (bulkCampana) filtered = filtered.filter(g => String(g.campana).trim() === String(bulkCampana).trim());
    
    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const g of filtered) {
      if (!seen.has(g.codigo)) {
        seen.add(g.codigo);
        unique.push(g);
      }
    }
    return unique.sort((a,b) => String(a.codigo).localeCompare(String(b.codigo)));
  }, [grupos, bulkPeriodo, bulkSegmento, bulkCampana])`;
  
  // also add .trim() to others
  content = content.replace(
    /grupos\.map\(g => g\.periodo \? String\(g\.periodo\) : null\)/g,
    "grupos.map(g => g.periodo ? String(g.periodo).trim() : null)"
  );
  content = content.replace(
    /filtered\.map\(g => g\.segmento\)/g,
    "filtered.map(g => g.segmento ? String(g.segmento).trim() : null)"
  );
  content = content.replace(
    /filtered\.map\(g => g\.campana\)/g,
    "filtered.map(g => g.campana ? String(g.campana).trim() : null)"
  );

  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log('Fixed uniqueness in', file);
});
