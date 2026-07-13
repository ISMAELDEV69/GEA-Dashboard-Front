import fs from 'fs'
import { checkCalibracionDia1 } from './src/lib/dataService.js'

async function run() {
   const res = await checkCalibracionDia1('GPE-2026013')
   console.log("Check result:", res)
}
run()
