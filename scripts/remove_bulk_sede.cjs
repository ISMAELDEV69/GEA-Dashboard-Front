const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// Remove the `bulkSede` state
content = content.replace(
  /\n\s*const \[bulkSede, setBulkSede\] = useState\(''\)/,
  ""
)

// Remove the Sede dropdown block
content = content.replace(
  /<div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800\/50 rounded-2xl border border-gray-100 dark:border-slate-800">[\s\S]+?<\/select>\n\s*<\/div>/,
  '<div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">'
)

// Remove bulkSede prop from NominaFormPool
content = content.replace(
  /\n\s*bulkSede=\{bulkSede\}/,
  ""
)

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Removed Sede from NominaForm');
