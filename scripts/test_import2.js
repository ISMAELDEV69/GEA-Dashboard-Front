import fs from 'fs'
import fetch from 'node-fetch'
global.fetch = fetch;

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'

async function run() {
  try {
     const res = await fetch(CSV_URL)
     const text = await res.text()
     console.log("Downloaded CSV length:", text.length)
     
     // I will use pg to test upsert
  } catch(e) {
     console.error(e)
  }
}
run()
