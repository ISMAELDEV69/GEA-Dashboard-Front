import { parseCapacidadRysCsv } from '../src/lib/capacidadRysSchema.js';

const CAPACIDAD_RYS_SHEET_ID = '2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70';
const CAPACIDAD_RYS_GID = '249081259';

async function testSync() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/e/${CAPACIDAD_RYS_SHEET_ID}/pub?gid=${CAPACIDAD_RYS_GID}&single=true&output=csv`;
  console.log(`1. Descargando CSV desde: ${csvUrl}`);
  
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
  
  const csvText = await res.text();
  console.log(`2. CSV recibido (${csvText.length} bytes)`);
  
  const payloads = parseCapacidadRysCsv(csvText);
  console.log(`3. Total de grupos procesados correctamente: ${payloads.length}`);
  
  if (payloads.length > 0) {
    console.log('\nEjemplo de los primeros 3 grupos parseados:');
    console.log(payloads.slice(0, 3));
  }
}

testSync().catch(console.error);
