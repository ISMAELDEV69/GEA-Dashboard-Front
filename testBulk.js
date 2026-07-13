import { insertPostulantesBulk } from './src/lib/dataService.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// Mock window/localstorage
globalThis.localStorage = { getItem: () => null, setItem: () => null };

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
globalThis.supabase = supabase; // mock if needed

async function test() {
  const XLSX = await import('xlsx');
  const { parseNominaRows } = await import('./src/lib/nominaConsolidadoSchema.js');
  const wb = XLSX.readFile('/Users/saidaquino/Library/Mobile Documents/com~apple~CloudDocs/ARCHIVOS/IMPLEMENTACION PORTAL/__MACOSX-1/GEAismael/PLANTILLA NOMINA/SEMANA 17 GRUPO PRUEBA.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const rows = parseNominaRows(matrix, {});
  
  console.log('Total rows:', rows.length);
  // Just simulate the first 5 rows to see what happens in insertPostulantesBulk
  try {
    const results = await insertPostulantesBulk(rows.slice(0, 5));
    console.log('Imported:', results.length);
  } catch (err) {
    console.error('Bulk error:', err);
  }
  process.exit();
}
test();
