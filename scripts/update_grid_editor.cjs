const fs = require('fs');
let content = fs.readFileSync('src/components/nomina/NominaGridEditor.jsx', 'utf8');

const newFunc = `
  const copyFirstRow = async () => {
    if (data.length < 2) return
    const firstRow = data[0]
    const updates = []
    
    // Copy all editable columns from the first row to the rest
    const updatedData = data.map((row, index) => {
      if (index === 0) return row
      const newRow = { ...row }
      EDITABLE_COLUMNS.forEach(col => {
        newRow[col.key] = firstRow[col.key]
      })
      updates.push(newRow)
      return newRow
    })
    
    setData(updatedData)
    setSavingRow('ALL')
    
    try {
      // Upsert all modified rows
      const { error: err } = await supabase.from('nominas').upsert(updates, { onConflict: 'documento' })
      if (err) throw err
    } catch (err) {
      console.error('Bulk save error', err)
      setError(err.message)
    } finally {
      setSavingRow(null)
    }
  }
`

if (!content.includes('copyFirstRow')) {
  content = content.replace(
    /if \(!grupoCodigo\) \{/,
    `${newFunc}\n\n  if (!grupoCodigo) {`
  )
}

content = content.replace(
  /<p className="text-xs text-slate-500">Editando grupo: <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">\{grupoCodigo\}<\/span> \(\{data\.length\} candidatos\)<\/p>\n\s*<\/div>/,
  `$&
          <div className="mt-2">
            <button 
              onClick={copyFirstRow}
              disabled={data.length < 2 || savingRow}
              className="text-xs px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <CheckCircle2 size={14} /> Replicar valores de la Fila 1 a todos
            </button>
          </div>`
)

fs.writeFileSync('src/components/nomina/NominaGridEditor.jsx', content);
console.log('NominaGridEditor updated!');
