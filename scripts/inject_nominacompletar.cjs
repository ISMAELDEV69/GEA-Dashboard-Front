const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// The <NominaForm ... /> is surrounded by {navItems.some(i => i.id === 'nomina') && ( ... )} inside some view check?
// Let's just find `</>` or something right after NominaForm and inject it there.
content = content.replace(
  /<NominaForm[\s\S]+?\/>\s*<\/>\s*\)\}/,
  `$&
                {activeView === 'nominas_completar' && <NominaCompletar grupos={grupos} />}`
)

fs.writeFileSync('src/App.jsx', content);
console.log('Injected NominaCompletar rendering');
