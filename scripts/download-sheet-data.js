/**
 * Descarga CSV publicados de Google Sheets a scripts/
 * Uso: npm run db:download-sheets
 */
import fs from 'fs'
import path from 'path'
import { SHEET_SOURCES, sheetCsvUrl } from '../src/lib/sheetSources.js'

async function download(source) {
  const url = sheetCsvUrl(source)
  const outPath = path.resolve(process.cwd(), source.localFile)
  console.log(`⬇️  ${source.label}`)
  console.log(`   ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${source.id}`)
  const text = await res.text()
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, text, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean).length
  console.log(`   ✅ ${outPath} (${lines} líneas, ${text.length} bytes)\n`)
}

async function run() {
  for (const source of Object.values(SHEET_SOURCES)) {
    await download(source)
  }
  console.log('✅ Descarga completada.')
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
