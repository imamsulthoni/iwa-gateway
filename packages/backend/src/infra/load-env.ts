import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

function findRootEnv(startFile: string): string | undefined {
  let dir = dirname(startFile)
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, '.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

const envPath = findRootEnv(fileURLToPath(import.meta.url))

if (envPath) {
  config({ path: envPath, override: false })
}
