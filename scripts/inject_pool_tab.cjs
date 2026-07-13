const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// Import NominaFormPool
if (!content.includes('NominaFormPool')) {
  content = content.replace(
    /import \{ fetchGruposConMetas \}/,
    "import NominaFormPool from './nomina/NominaFormPool.jsx'\nimport { fetchGruposConMetas }"
  )
}

// Add tab state
if (!content.includes('Bolsa de Google Forms')) {
  content = content.replace(
    /<button\s*onClick=\{([^}]+)\}\s*className=\{`[^`]+ \$\{importMode === 'excel' \? '[^']+' : '[^']+'\}`\}>\s*Importar Excel \/ CSV\s*<\/button>/g,
    `$&
            <button
              onClick={() => setImportMode('pool')}
              className={\`flex-1 py-4 text-sm font-bold border-b-2 transition-colors \${importMode === 'pool' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}\`}
            >
              Bolsa de Google Forms
            </button>`
  )
}

// Render the pool
if (!content.includes('<NominaFormPool')) {
  content = content.replace(
    /\{importMode === 'excel' && \(\s*<div className="animate-in fade-in zoom-in duration-200">\s*\{!\(bulkPeriodo && bulkSegmento && bulkCampana && bulkGrupo\)/g,
    `{importMode === 'pool' && (
              <div className="animate-in fade-in zoom-in duration-200 mt-6">
                <NominaFormPool 
                  bulkPeriodo={bulkPeriodo} 
                  bulkSegmento={bulkSegmento} 
                  bulkCampana={bulkCampana} 
                  bulkGrupo={bulkGrupo} 
                  reclutador={userProfile?.nombre_completo}
                />
              </div>
            )}\n\n            $&`
  )
}

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Injected Pool tab!');
