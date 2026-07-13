const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

// Rename 'nomina' to 'Bolsa de Postulantes'
content = content.replace(
  /\{\s*id:\s*'nomina',\s*label:\s*'Nómina',\s*icon:\s*UserPlus,\s*description:\s*'Ingreso de Postulantes',\s*roles:\s*\['admin','reclutador'\]\s*\}/,
  "{ id: 'nomina', label: 'Bolsa de Postulantes', icon: UserPlus, description: 'Ingreso de Postulantes', roles: ['admin','reclutador'] }"
)

// Add new route in MENU_ITEMS
content = content.replace(
  /\{\s*id:\s*'nomina',\s*label:\s*'Bolsa de Postulantes',[^}]+?\}/,
  "$&,\n  { id: 'nominas_completar', label: 'Nóminas', icon: ClipboardCheck, description: 'Completar Datos', roles: ['admin','reclutador','formador'] }"
)

// Add new route rendering
// First import the new page
if (!content.includes('NominaCompletar')) {
  content = content.replace(
    /import NominaForm from '\.\/components\/NominaForm'/,
    "import NominaForm from './components/NominaForm'\nimport NominaCompletar from './pages/NominaCompletar'"
  )
}

// Add the rendering condition
content = content.replace(
  /\{activeView === 'nomina' && <NominaForm \/>\}/,
  "{activeView === 'nomina' && <NominaForm />}\n          {activeView === 'nominas_completar' && <NominaCompletar />}"
)

fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx updated with new routing');
