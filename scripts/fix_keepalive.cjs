const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

// Remove from inside `nomina` KeepAliveView
content = content.replace(
  /\s*\{activeView === 'nominas_completar' && <NominaCompletar grupos=\{grupos\} \/>\}/,
  ""
)

// Add its own KeepAliveView after `nomina` KeepAliveView
content = content.replace(
  /<\/KeepAliveView>\s*<KeepAliveView viewId="asistencia"/,
  `</KeepAliveView>\n\n              <KeepAliveView viewId="nominas_completar" activeView={activeView}>\n                {navItems.some(i => i.id === 'nominas_completar') && (\n                  <NominaCompletar grupos={grupos} />\n                )}\n              </KeepAliveView>\n\n              <KeepAliveView viewId="asistencia"`
)

fs.writeFileSync('src/App.jsx', content);
console.log('Fixed KeepAliveView for nominas_completar');
