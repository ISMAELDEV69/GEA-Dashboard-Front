const fs = require('fs');
let code = fs.readFileSync('src/lib/dataService.js', 'utf8');

code = code.replace(/export async function fetchReclutadores\(\) \{[\s\S]*?return \[\.\.\.names\]\.sort\(\)\n  \}/, 
`export async function fetchReclutadores() {
  if (DB_MODE === 'supabase') {
    const { data: recRes, error: recErr } = await supabase
      .from('equipo_reclutamiento')
      .select('apellido_paterno, apellido_materno, nombres_completos')
      .eq('estado', 'ACTIVO')
      
    if (recErr) throw recErr

    const names = new Set()
    for (const r of recRes || []) {
      const full = \`\${r.apellido_paterno || ''} \${r.apellido_materno || ''} \${r.nombres_completos || ''}\`.trim().replace(/\\s+/g, ' ')
      if (full) names.add(full.toUpperCase())
    }
    return [...names].sort()
  }`);

fs.writeFileSync('src/lib/dataService.js', code);
