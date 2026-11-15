import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const PACKAGES = join(ROOT, 'packages')

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...walk(full))
    } else if (/^\.env/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

const offenders = walk(PACKAGES)

if (offenders.length > 0) {
  console.error('Ditemukan file env di dalam packages/:')
  for (const file of offenders) console.error(`- ${file}`)
  console.error('Hanya root .env yang boleh ada. Hapus file di atas.')
  process.exit(1)
}

console.log('OK: tidak ada file .env* di packages/.')
