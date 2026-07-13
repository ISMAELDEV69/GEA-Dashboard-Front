import { syncCapacidadRysFromDrive } from './src/lib/dataService.js'

async function run() {
  console.log("Starting sync...")
  try {
    const res = await syncCapacidadRysFromDrive({ onProgress: (p) => console.log(p.phase, p.message) })
    console.log("Result:", JSON.stringify(res, null, 2))
  } catch (err) {
    console.error("Crash:", err)
  }
}

run()
