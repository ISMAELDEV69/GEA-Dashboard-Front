import fs from 'fs';

let content = fs.readFileSync('src/lib/dataService.js', 'utf8');

// Replace remaining 'grupos_capacitacion' with 'capacidad_rys' where it's querying the table
content = content.replace(/'grupos_capacitacion'/g, "'capacidad_rys'");
content = content.replace(/\.from\('grupos_capacitacion'\)/g, ".from('capacidad_rys')");

// Also there are some specific queries like:
// const { data: grpData } = await supabase.from('capacidad_rys').select('id').eq('codigo', grupo_codigo).order('created_at', { ascending: false }).limit(1).single()
// Wait, capacidad_rys doesn't have an 'id' column anymore! It uses 'codigo' as PRIMARY KEY!
// If they query 'id' from 'capacidad_rys', it will fail!
