const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaFormPool.jsx', 'utf8');

// Add th
content = content.replace(
  /<th className="p-3 font-semibold text-slate-600 dark:text-slate-300">DNI<\/th>/,
  '<th className="p-3 font-semibold text-slate-600 dark:text-slate-300">DNI</th>\n                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Fecha Registro</th>'
)

// Add td
content = content.replace(
  /\{existingDocs\.has\(d\.documento\) && \(\n\s*<span className="ml-2 px-1.5 py-0.5 rounded text-\[10px\] bg-amber-100 text-amber-700 dark:bg-amber-900\/30 dark:text-amber-400">Asignado: \{existingDocs\.get\(d\.documento\)\}<\/span>\n\s*\)\}\n\s*<\/td>/,
  `$&
                  <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                    {d.marca_temporal || 'Sin Fecha'}
                  </td>`
)

fs.writeFileSync('src/components/nomina/NominaFormPool.jsx', content);
console.log('Added Fecha Registro to NominaFormPool');
