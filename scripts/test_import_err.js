import fs from 'fs'
import fetch from 'node-fetch'
global.fetch = fetch

import pkg from 'pg';
const { Client } = pkg;

const envStr = fs.readFileSync('.env.local', 'utf8')
let dbUrl, anonKey, projectUrl;
for (const line of envStr.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_URL=')) projectUrl = line.split('=')[1].trim();
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) anonKey = line.split('=')[1].trim();
}

import { createClient } from '@supabase/supabase-js'
const supabase = createClient(projectUrl, anonKey)

const CAPACIDAD_RYS_SHEET_ID = '2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70'
const csvUrl = `https://docs.google.com/spreadsheets/d/e/${CAPACIDAD_RYS_SHEET_ID}/pub?output=csv`

// Simple CSV parser for testing
function parse(text) {
   // Assuming simple comma split for headers
   const lines = text.split('\n')
   const headers = lines[0].split(',')
   return lines.slice(1).map(l => {
     const vals = l.split(',')
     return {
        codigo: vals[3] || null,
        campana_nombre: vals[2] || null,
        segmento: vals[0] || null
     }
   })
}

async function run() {
  try {
     const res = await fetch(csvUrl)
     const text = await res.text()
     const payloads = parse(text).slice(0, 100) // limit test
     
     // Mimic the upsert logic
     const { data: existingCampanas } = await supabase.from('campanas').select('id, nombre')
     const campanaMap = new Map()
     existingCampanas.forEach(c => campanaMap.set(c.nombre.toUpperCase(), c.id))
     
     const { data: existingGroups } = await supabase.from('grupos_capacitacion').select('id, codigo, campana_id')
     const usedGroups = new Set()
     
     const rowsToUpsert = payloads.map(p => {
        const cNombre = (p.campana_nombre || 'SIN CAMPAÑA').toUpperCase()
        const campana_id = campanaMap.get(cNombre) || null
        const codigo = p.codigo || null
        let match = existingGroups.find(g => !usedGroups.has(g.id) && (g.codigo || null) === codigo && g.campana_id === campana_id)
        if (!match) match = existingGroups.find(g => !usedGroups.has(g.id) && (g.codigo || null) === codigo)
        if (match) usedGroups.add(match.id)
        
        return {
           ...(match ? { id: match.id } : {}),
           codigo,
           campana_id,
           fecha_registro: new Date().toISOString().split('T')[0], // required
        }
     })
     
     const { error } = await supabase.from('grupos_capacitacion').upsert(rowsToUpsert, { onConflict: 'id' })
     if (error) console.error("Upsert Error:", error)
     else console.log("Success")
     
  } catch(e) {
     console.error(e)
  }
}
run()
