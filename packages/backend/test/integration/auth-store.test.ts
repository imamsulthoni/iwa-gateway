import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { useDbAuthState } from '../../src/baileys/auth-store.js'
import { newId } from '../../src/db/id.js'
import { waAuthCreds, waAuthKeys, waSessions } from '../../src/db/schema.js'
import { createCipher } from '../../src/infra/crypto.js'
import { validateEnv } from '../../src/infra/env.js'
import { createLogger } from '../../src/infra/logger.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('auth store terenkripsi', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let cipher: ReturnType<typeof createCipher>
  let logger: ReturnType<typeof createLogger>

  beforeAll(async () => {
    connection = await setupTestDb()
    cipher = createCipher(validateEnv().AUTH_ENC_KEY)
    logger = createLogger('silent')
  })

  afterAll(async () => {
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
  })

  async function insertSession() {
    const id = newId()
    await connection.db.insert(waSessions).values({ id, publicId: id.slice(0, 32), label: 'Auth' })
    return id
  }

  it('menyimpan creds dan keys dalam bentuk terenkripsi', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, {
      db: connection.db,
      cipher,
      logger,
    })

    await auth.state.keys.set({
      'pre-key': {
        '1': { private: Buffer.from('private-key'), public: Buffer.from('public-key') },
      },
    } as never)

    const credsRows = await connection.db.select().from(waAuthCreds)
    const keyRows = await connection.db.select().from(waAuthKeys)
    expect(credsRows).toHaveLength(1)
    expect(keyRows).toHaveLength(1)
    expect(credsRows[0]?.creds).not.toContain('noiseKey')
    expect(keyRows[0]?.value).not.toContain('private-key')

    const loaded = await auth.state.keys.get('pre-key', ['1'])
    expect(loaded['1']).toBeDefined()
  })

  it('batch set menghapus nilai null secara atomik', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })

    await auth.state.keys.set({
      'pre-key': { '1': { private: Buffer.from('a'), public: Buffer.from('b') } },
      session: { s1: Buffer.from('sesi') },
    } as never)
    expect(await connection.db.select().from(waAuthKeys)).toHaveLength(2)

    await auth.state.keys.set({
      'pre-key': { '1': null },
      session: { s1: null },
    } as never)
    expect(await connection.db.select().from(waAuthKeys)).toHaveLength(0)
  })

  it('clear menghapus seluruh auth sesi', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })
    await auth.clear()

    expect(await connection.db.select().from(waAuthCreds)).toHaveLength(0)
    expect(await connection.db.select().from(waAuthKeys)).toHaveLength(0)
  })
})
