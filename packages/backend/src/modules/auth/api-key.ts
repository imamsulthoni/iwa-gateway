import { createHash, timingSafeEqual } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { apiKeys } from '../../db/schema.js'

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function verifyApiKey(plaintext: string, keyHash: string): boolean {
  const expected = Buffer.from(hashApiKey(plaintext), 'hex')
  const actual = Buffer.from(keyHash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export type ApiKeyAuthenticator = {
  findActive: (plaintext: string) => Promise<{ id: string } | null>
}

export function createApiKeyAuthenticator(db: Database): ApiKeyAuthenticator {
  return {
    async findActive(plaintext: string) {
      const [row] = await db
        .select({ id: apiKeys.id })
        .from(apiKeys)
        .where(and(eq(apiKeys.keyHash, hashApiKey(plaintext)), isNull(apiKeys.revokedAt)))
        .limit(1)
      return row ?? null
    },
  }
}
