const fs = require('fs');
let content = fs.readFileSync('src/components/NominaForm.jsx', 'utf8');

// 1. Add imports
content = content.replace(
  /import NominaFieldGrid from '\.\/nomina\/NominaFieldGrid'/,
  "import NominaFieldGrid from './nomina/NominaFieldGrid'\nimport NominaFormPool from './nomina/NominaFormPool.jsx'\nimport NominaGridEditor from './nomina/NominaGridEditor.jsx'"
)

// 2. Add subTab state
if (!content.includes('bulkSubTab')) {
  content = content.replace(
    /const \[activeTab, setActiveTab\] = useState\('manual'\)/,
    "const [activeTab, setActiveTab] = useState('manual')\n  const [bulkSubTab, setBulkSubTab] = useState('pool')"
  )
}

// 3. Add Sede to bulk state
if (!content.includes('bulkSede')) {
  content = content.replace(
    /const \[bulkGrupo, setBulkGrupo\] = useState\(''\)/,
    "const [bulkGrupo, setBulkGrupo] = useState('')\n  const [bulkSede, setBulkSede] = useState('')"
  )
}

// 4. Inject Sede filter UI
content = content.replace(
  /<div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800\/50 rounded-2xl border border-gray-100 dark:border-slate-800">/,
  `<div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Sede</label>
                  <select value={bulkSede} onChange={e => setBulkSede(e.target.value)} className="w-full text-sm border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="" disabled>Seleccione Sede</option>
                    {sedes.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                  </select>
                </div>`
)

// 5. Inject sub-tabs UI inside bulk tab, right after bulkGrupo warning
content = content.replace(
  /\{bulkGrupo && \(\s*<div className="mb-4 p-3 bg-blue-50\/50 dark:bg-blue-900\/20[^>]+>[\s\S]+?<\/div>\s*\)\}/,
  `$&
              {/* SUB TABS PARA EL FLUJO */}
              <div className="flex border-b border-gray-200 dark:border-slate-800 mb-6 mt-4">
                <button
                  onClick={() => setBulkSubTab('pool')}
                  className={\`pb-3 px-6 font-medium text-sm border-b-2 transition-colors \${
                    bulkSubTab === 'pool'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'
                  }\`}
                >
                  Bolsa de Google Forms
                </button>
                <button
                  onClick={() => setBulkSubTab('grid')}
                  className={\`pb-3 px-6 font-medium text-sm border-b-2 transition-colors \${
                    bulkSubTab === 'grid'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'
                  }\`}
                >
                  Completar Datos
                </button>
                <button
                  onClick={() => setBulkSubTab('excel')}
                  className={\`pb-3 px-6 font-medium text-sm border-b-2 transition-colors \${
                    bulkSubTab === 'excel'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-slate-400'
                  }\`}
                >
                  Importar Excel Tradicional
                </button>
              </div>

              {bulkSubTab === 'pool' && (
                <NominaFormPool 
                  bulkPeriodo={bulkPeriodo} 
                  bulkSegmento={bulkSegmento} 
                  bulkCampana={bulkCampana} 
                  bulkGrupo={bulkGrupo}
                  bulkSede={bulkSede}
                  reclutador={userProfile?.nombre_completo}
                  grupos={grupos}
                />
              )}

              {bulkSubTab === 'grid' && (
                <NominaGridEditor grupoCodigo={bulkGrupo} />
              )}
  `
)

// 6. Wrap the old excel upload logic inside {bulkSubTab === 'excel' && (...)}
content = content.replace(
  /<div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-2xl p-10 text-center transition-colors bg-white dark:bg-slate-900 group relative">/,
  `{bulkSubTab === 'excel' && (\n                $&`
)

content = content.replace(
  /<\/div>\s*\{\/\* ── FIN BULK UPLOAD TAB ── \*\/\}/,
  `\n              )}
              </div>
            {/* ── FIN BULK UPLOAD TAB ── */}`
)


fs.writeFileSync('src/components/NominaForm.jsx', content);
console.log('Tabs injected!');
