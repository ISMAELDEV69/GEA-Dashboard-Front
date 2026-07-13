const fs = require('fs');

let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

// Update deduplication key to campana + '_' + codigo
content = content.replace(
  /uniqueRowsMap\.set\(r\.codigo, r\)/g,
  "uniqueRowsMap.set(r.campana + '_' + r.codigo, r)"
);

// Update upsert onConflict
content = content.replace(
  /upsert\(batch, \{ onConflict: 'codigo' \}\)/g,
  "upsert(batch, { onConflict: 'campana,codigo' })"
);

fs.writeFileSync('src/lib/dataService.js', content);
console.log('Successfully updated dataService.js for composite PK!');
