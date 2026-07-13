const fs = require('fs');

let content = fs.readFileSync('src/components/ConsolidadoPowerBI.jsx', 'utf8');

if (!content.includes('const [periodo, setPeriodo]')) {
  // Add state
  content = content.replace(
    /const \[segmento, setSegmento\] = useState\('Todas'\);/,
    "const [segmento, setSegmento] = useState('Todas');\n  const [periodo, setPeriodo] = useState('Todas');"
  );

  // Add to options Set
  content = content.replace(
    /const segmentos = new Set\(\['Todas'\]\);/,
    "const segmentos = new Set(['Todas']);\n    const periodos = new Set(['Todas']);"
  );
  
  // Add to forEach
  content = content.replace(
    /if \(d\.segmento\) segmentos\.add\(d\.segmento\);/,
    "if (d.segmento) segmentos.add(d.segmento);\n      if (d.periodo) periodos.add(d.periodo);"
  );

  // Add to filterOptions return
  content = content.replace(
    /segmentos: Array\.from\(segmentos\),/,
    "segmentos: Array.from(segmentos),\n      periodos: Array.from(periodos).sort((a,b)=>b.localeCompare(a)),"
  );

  // Add to pivotRows map building
  content = content.replace(
    /if \(segmento !== 'Todas' && d\.segmento !== segmento\) return;/,
    "if (segmento !== 'Todas' && d.segmento !== segmento) return;\n      if (periodo !== 'Todas' && d.periodo !== periodo) return;"
  );

  // Add to UI elements
  content = content.replace(
    /\{ label: 'SEGMENTO', val: segmento, set: setSegmento, opts: filterOptions\.segmentos \},/,
    "{ label: 'PERÍODO', val: periodo, set: setPeriodo, opts: filterOptions.periodos },\n            { label: 'SEGMENTO', val: segmento, set: setSegmento, opts: filterOptions.segmentos },"
  );
  
  fs.writeFileSync('src/components/ConsolidadoPowerBI.jsx', content);
  console.log('Added Periodo filter to ConsolidadoPowerBI.jsx');
}
