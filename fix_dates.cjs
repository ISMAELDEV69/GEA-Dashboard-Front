const fs = require('fs');
const file = 'src/lib/dataService.js';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('export function parseFechaAsistencia')) {
  const insertPos = content.indexOf('export async function getConsolidadoStatus()');
  const helper = `
export function parseFechaAsistencia(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length === 3) {
      return \`\${parts[2]}-\${parts[1].padStart(2, '0')}-\${parts[0].padStart(2, '0')}\`;
    }
  } else if (raw.includes('-')) {
    return raw.substring(0, 10);
  }
  return raw;
}
`;
  content = content.slice(0, insertPos) + helper + content.slice(insertPos);
}

// 1. getFirstDateFormador
content = content.replace(/const parts = row\.fecha_registro_asistencia\.split\('\/'\)\s*if \(parts\.length === 3\) {\s*const iso = `\$\{parts\[2\]\}-\$\{parts\[1\]\.padStart\(2, '0'\)\}-\$\{parts\[0\]\.padStart\(2, '0'\)\}`;\s*if \(!earliestIso \|\| iso < earliestIso\) {\s*earliestIso = iso;\s*earliestRaw = row\.fecha_registro_asistencia;\s*}\s*}/g,
`const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
      if (iso && (!earliestIso || iso < earliestIso)) {
        earliestIso = iso;
        earliestRaw = row.fecha_registro_asistencia;
      }`);

// 2. fetchAsistencias
content = content.replace(/let isoDate = '';\s*if \(row\.fecha_registro_asistencia\) {\s*const parts = row\.fecha_registro_asistencia\.split\('\/'\);\s*if \(parts\.length === 3\) {\s*isoDate = `\$\{parts\[2\]\}-\$\{parts\[1\]\.padStart\(2, '0'\)\}-\$\{parts\[0\]\.padStart\(2, '0'\)\}`;\s*}\s*}/g,
`let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);`);

// 3. checkCalibracionDia1, checkReporteDia1Alineado, etc.
content = content.replace(/let isoDate = ''\s*if \(row\.fecha_registro_asistencia\) {\s*const parts = row\.fecha_registro_asistencia\.split\('\/'\)\s*if \(parts\.length === 3\) isoDate = `\$\{parts\[2\]\}-\$\{parts\[1\]\.padStart\(2, '0'\)\}-\$\{parts\[0\]\.padStart\(2, '0'\)\}`\s*}/g, 
`let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);`);

// 4. Any map with inline arrow function that parses
content = content.replace(/const formAsis = groupFormAsisRaw\.filter\(f => f\.fecha_registro_asistencia\)\.map\(row => {\s*let isoDate = ''\s*if \(row\.fecha_registro_asistencia\) {\s*const parts = row\.fecha_registro_asistencia\.split\('\/'\)\s*if \(parts\.length === 3\) isoDate = `\$\{parts\[2\]\}-\$\{parts\[1\]\.padStart\(2, '0'\)\}-\$\{parts\[0\]\.padStart\(2, '0'\)\}`\s*}/g,
`const formAsis = groupFormAsisRaw.filter(f => f.fecha_registro_asistencia).map(row => {
        let isoDate = parseFechaAsistencia(row.fecha_registro_asistencia);`);

// 5. one more case in procesarGruposDia1Background:
content = content.replace(/let earliestIso = null;\s*let earliestRaw = null;\s*for \(const row of rawFormAsis\) {\s*if \(row\.fecha_registro_asistencia\) {\s*const parts = row\.fecha_registro_asistencia\.split\('\/'\)\s*if \(parts\.length === 3\) {\s*const iso = `\$\{parts\[2\]\}-\$\{parts\[1\]\.padStart\(2, '0'\)\}-\$\{parts\[0\]\.padStart\(2, '0'\)\}`;\s*if \(!earliestIso \|\| iso < earliestIso\) {\s*earliestIso = iso;\s*earliestRaw = row\.fecha_registro_asistencia;\s*}\s*}\s*}\s*}/g,
`let earliestIso = null;
      let earliestRaw = null;
      for (const row of rawFormAsis) {
        const iso = parseFechaAsistencia(row.fecha_registro_asistencia);
        if (iso && (!earliestIso || iso < earliestIso)) {
          earliestIso = iso;
          earliestRaw = row.fecha_registro_asistencia;
        }
      }`);

fs.writeFileSync(file, content);
console.log('Fixed dates in dataService.js');
