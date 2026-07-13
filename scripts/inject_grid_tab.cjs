const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// Import NominaGridEditor
if (!content.includes('NominaGridEditor')) {
  content = content.replace(
    /import NominaFormPool/,
    "import NominaGridEditor from './nomina/NominaGridEditor.jsx'\nimport NominaFormPool"
  )
}

// Add tab state
if (!content.includes('Completar Datos')) {
  content = content.replace(
    /<button\s*onClick=\{([^}]+)\}\s*className=\{`[^`]+ \$\{importMode === 'pool' \? '[^']+' : '[^']+'\}`\}>\s*Bolsa de Google Forms\s*<\/button>/g,
    `$&
            <button
              onClick={() => setImportMode('grid')}
              className={\`flex-1 py-4 text-sm font-bold border-b-2 transition-colors \${importMode === 'grid' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}\`}
            >
              Completar Datos
            </button>`
  )
}

// Render the grid
if (!content.includes('<NominaGridEditor')) {
  content = content.replace(
    /\{importMode === 'pool' && \(/g,
    `{importMode === 'grid' && (
              <div className="animate-in fade-in zoom-in duration-200 mt-6">
                <NominaGridEditor grupoCodigo={bulkGrupo} />
              </div>
            )}\n\n            $&`
  )
}

fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Injected Grid tab!');
