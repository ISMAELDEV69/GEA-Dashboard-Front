const fs = require('fs');

let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// Remove the button
content = content.replace(
  /<button\s+onClick=\{[^}]+\}\s+className=\{`pb-3 px-6 font-medium text-sm border-b-2 transition-colors \$\{\s*bulkSubTab === 'grid'\s*\?\s*'border-blue-600 text-blue-600'\s*:\s*'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'\s*\}`\}\s*>\s*Completar Datos\s*<\/button>/g,
  ""
)

// Remove the rendering logic
content = content.replace(
  /\{bulkSubTab === 'grid' && \(\s*<NominaGridEditor grupoCodigo=\{bulkGrupo\} \/>\s*\)\}/g,
  ""
)

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Removed Grid Subtab from NominaForm');
