const fs = require('fs');

let content = fs.readFileSync('scripts/rebuild_view.js', 'utf8');

// Replace the LEFT JOIN
content = content.replace(
  /LEFT JOIN capacidad_rys cr ON cr\.codigo = n\.grupo_codigo/g,
  "LEFT JOIN capacidad_rys cr ON cr.campana = n.campana AND cr.codigo = n.grupo_codigo"
);

fs.writeFileSync('scripts/rebuild_view.js', content);
console.log('Successfully updated rebuild_view.js');
