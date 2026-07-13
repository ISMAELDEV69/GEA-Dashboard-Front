import fs from 'fs';
import * as XLSX from 'xlsx/xlsx.mjs';

XLSX.set_fs(fs);
const wb = XLSX.readFile('/tmp/capacidad.xlsx');
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(JSON.stringify(json.slice(0, 5), null, 2));
