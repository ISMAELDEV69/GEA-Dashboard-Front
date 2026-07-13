import fs from 'fs'
import { checkCalibracionDia1 } from '../src/lib/dataService.js'

async function run() {
  try {
     console.log(await checkCalibracionDia1('GPE-2026013'))
     console.log("Recheck complete")
  } catch(e) {
     console.error("Error:", e)
  }
}
run()
