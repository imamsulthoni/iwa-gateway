import '../../infra/load-env.js'

import { createHash, randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { createDb } from '../client.js'
import { newId } from '../id.js'
import { apiKeys } from '../schema.js'
import { validateEnv } from '../../infra/env.js'

async function main(): Promise<void> {
  const env = validateEnv()
  const { db, pool } = createDb(env.DATABASE_URL)
  const [command, argument] = process.argv.slice(2)

  try {
    if (command === '--revoke') {
      if (!argument) {
        throw new Error('Pemakaian: db:seed:key --revoke <id>')
      }
      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, argument))
      process.stdout.write(`API key ${argument} dicabut\n`)
      return
    }

    const name = command ?? 'admin'
    const plaintext = `wa_${randomBytes(32).toString('base64url')}`
    const keyHash = createHash('sha256').update(plaintext).digest('hex')
    await db.insert(apiKeys).values({ id: newId(), name, keyHash })
    process.stdout.write('API key dibuat. Simpan sekarang, hanya tampil sekali:\n')
    process.stdout.write(`${plaintext}\n`)
  } finally {
    await pool.end()
  }
}

await main()
