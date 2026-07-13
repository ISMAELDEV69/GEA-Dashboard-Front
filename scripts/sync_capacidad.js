import fs from 'fs'
import 'dotenv/config'
import { syncCapacidadRysFromDrive } from '../src/lib/dataService.js'

async function run() {
  try {
    const res = await syncCapacidadRysFromDrive({
      onProgress: (p) => console.log(p.message)
    })
    console.log("Success:", res)
  } catch(e) {
    console.error("Error syncing:", e)
  }
}

run()
