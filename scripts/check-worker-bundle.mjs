import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'packages/backend/dist')

function read(name) {
  try {
    return readFileSync(join(DIST, name), 'utf8')
  } catch {
    console.error(`File ${name} tidak ditemukan. Jalankan pnpm build dulu.`)
    process.exit(1)
  }
}

const api = read('api.js')
const worker = read('worker.js')

const honoPattern = /["']hono(?:\/[^"']*)?["']/
const apiHasHono = honoPattern.test(api)
const workerHasHono = honoPattern.test(worker)

if (!apiHasHono) {
  console.error('dist/api.js tidak memuat Hono. Periksa konfigurasi build.')
  process.exit(1)
}

if (workerHasHono) {
  console.error('dist/worker.js memuat Hono. Worker tidak boleh mengimpor src/api.')
  process.exit(1)
}

console.log('OK: dist/api.js memuat Hono, dist/worker.js tidak.')
