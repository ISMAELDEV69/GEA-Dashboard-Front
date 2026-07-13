import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse' // not installed, let's just use regex or require local file

// read .env.local
const env = fs.readFileSync('.env.local', 'utf-8')
const SUPABASE_URL = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const SUPABASE_ANON_KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testSync() {
  console.log("Fetching CSV...")
  const res = await fetch("https://docs.google.com/spreadsheets/d/1GNbzbpIDbueydVqOQr-D032Pma1L9FkHf-JPsU9Qi1s/export?format=csv&gid=249081259")
  const text = await res.text()
  
  // Use our parser
  const parseCsvToMatrix = (text) => {
    const rows = []
    let row = [], cell = '', inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1]
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else cell += ch
      } else if (ch === '"') { inQuotes = true } 
      else if (ch === ',' || ch === '\t') { row.push(cell); cell = '' } 
      else if (ch === '\r') {} 
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' } 
      else { cell += ch }
    }
    if (cell || row.length > 0) { row.push(cell); rows.push(row) }
    return rows
  }
  
  const matrix = parseCsvToMatrix(text)
  
  // just try to upsert the first batch manually to see the error
  // but we can't easily reproduce all dependencies... let's just do a direct API call
  // actually, why not use Vite to run the module directly?
}

testSync()
