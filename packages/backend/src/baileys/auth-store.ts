import {
  BufferJSON,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import { and, eq, inArray } from 'drizzle-orm'

import type { Database } from '../db/client.js'
import { waAuthCreds, waAuthKeys } from '../db/schema.js'
import type { Cipher } from '../infra/crypto.js'
import type { AppLogger } from '../infra/logger.js'

export type DbAuthState = {
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clear: () => Promise<void>
}

export type AuthStoreDeps = {
  db: Database
  cipher: Cipher
  logger: AppLogger
}

export async function hasAuthState(db: Database, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: waAuthCreds.sessionId })
    .from(waAuthCreds)
    .where(eq(waAuthCreds.sessionId, sessionId))
    .limit(1)
  return Boolean(row)
}

export async function useDbAuthState(
  sessionId: string,
  { db, cipher, logger }: AuthStoreDeps,
): Promise<DbAuthState> {
  const [credsRow] = await db
    .select()
    .from(waAuthCreds)
    .where(eq(waAuthCreds.sessionId, sessionId))
    .limit(1)

  const creds: AuthenticationCreds = credsRow
    ? (JSON.parse(cipher.decrypt(credsRow.creds), BufferJSON.reviver) as AuthenticationCreds)
    : initAuthCreds()

  async function saveCreds(): Promise<void> {
    const payload = cipher.encrypt(JSON.stringify(creds, BufferJSON.replacer))
    await db
      .insert(waAuthCreds)
      .values({ sessionId, creds: payload, updatedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { creds: payload, updatedAt: new Date() } })
  }

  if (!credsRow) {
    await saveCreds()
  }

  const keys = {
    async get<T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[],
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> {
      if (ids.length === 0) return {}
      const rows = await db
        .select()
        .from(waAuthKeys)
        .where(
          and(
            eq(waAuthKeys.sessionId, sessionId),
            eq(waAuthKeys.type, type),
            inArray(waAuthKeys.keyId, ids),
          ),
        )
      const result: { [id: string]: SignalDataTypeMap[T] } = {}
      for (const row of rows) {
        result[row.keyId] = JSON.parse(
          cipher.decrypt(row.value),
          BufferJSON.reviver,
        ) as SignalDataTypeMap[T]
      }
      return result
    },

    async set(data: SignalDataSet): Promise<void> {
      await db.transaction(async (tx) => {
        for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const entries = data[type]
          if (!entries) continue
          for (const [keyId, value] of Object.entries(entries)) {
            if (value === null || value === undefined) {
              await tx
                .delete(waAuthKeys)
                .where(
                  and(
                    eq(waAuthKeys.sessionId, sessionId),
                    eq(waAuthKeys.type, type),
                    eq(waAuthKeys.keyId, keyId),
                  ),
                )
              continue
            }
            const encrypted = cipher.encrypt(JSON.stringify(value, BufferJSON.replacer))
            await tx
              .insert(waAuthKeys)
              .values({ sessionId, type, keyId, value: encrypted })
              .onDuplicateKeyUpdate({ set: { value: encrypted } })
          }
        }
      })
    },
  }

  const cachedKeys = makeCacheableSignalKeyStore(
    keys,
    logger as unknown as Parameters<typeof makeCacheableSignalKeyStore>[1],
  )

  return {
    state: { creds, keys: cachedKeys },
    saveCreds,
    async clear(): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(waAuthKeys).where(eq(waAuthKeys.sessionId, sessionId))
        await tx.delete(waAuthCreds).where(eq(waAuthCreds.sessionId, sessionId))
      })
    },
  }
}
