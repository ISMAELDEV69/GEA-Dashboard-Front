const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaFormPool.jsx', 'utf8');

// Update toggleAll
content = content.replace(
  /const toggleAll = \(\) => \{\n\s*if \(selectedDocs\.size === availableData\.length\) \{\n\s*setSelectedDocs\(new Set\(\)\)\n\s*\} else \{\n\s*setSelectedDocs\(new Set\(availableData\.map\(d => d\.documento\)\)\)\n\s*\}/,
  "const toggleAll = () => {\n    const selectable = availableData.filter(d => !existingDocs.has(d.documento))\n    if (selectedDocs.size === selectable.length) {\n      setSelectedDocs(new Set())\n    } else {\n      setSelectedDocs(new Set(selectable.map(d => d.documento)))\n    }"
)

fs.writeFileSync('src/components/nomina/NominaFormPool.jsx', content);
console.log('NominaFormPool toggleAll updated!');
