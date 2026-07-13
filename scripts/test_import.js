import fs from 'fs'
import fetch from 'node-fetch'
global.fetch = fetch;
import { syncCapacidadRysFromDrive } from './src/lib/dataService.js'

async function run() {
  try {
     const res = await syncCapacidadRysFromDrive()
     console.log(res)
  } catch(e) {
     console.error(e)
  }
}
run()
