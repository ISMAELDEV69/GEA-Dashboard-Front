const fs = require('fs');

let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

// Add segmento to the payload
content = content.replace(
  /area_traslado: p\.area_traslado \|\| null,/,
  "area_traslado: p.area_traslado || null,\n        segmento: p.segmento || null,"
);

fs.writeFileSync('src/lib/dataService.js', content);
console.log('Added segmento to import payload!');
