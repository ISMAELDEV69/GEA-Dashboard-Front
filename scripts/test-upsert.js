import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8')
const SUPABASE_URL = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const SUPABASE_KEY = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { syncCapacidadRysFromDrive } = await import('./src/lib/dataService.js')
  // override the client with service role for testing
  global.supabase = supabase 
  
  console.log("Starting sync with Service Role...")
  try {
    const res = await syncCapacidadRysFromDrive({ onProgress: (p) => console.log(p.phase, p.message) })
    console.log("Result:", JSON.stringify(res, null, 2))
  } catch (err) {
    console.error("Crash:", err)
  }
}

run()
