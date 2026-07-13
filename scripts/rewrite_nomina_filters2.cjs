const fs = require('fs');

let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

content = content.replace(
  /key=\{g\.id \|\| g\.codigo\} value=\{g\.codigo\}/g,
  "key={g.grupo_codigo} value={g.grupo_codigo}"
);

content = content.replace(
  /\{String\(g\.codigo\)\.startsWith\('PROY-'\) \? '—' : String\(g\.codigo\)\.replace\(\/_\\\\d\+\$\/, ''\)\}/g,
  "{String(g.grupo_codigo).startsWith('PROY-') ? '—' : String(g.grupo_codigo).replace(/_\\d+$/, '')}"
);

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Fixed NominaForm.jsx grupo_codigo!');
