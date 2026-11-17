import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BufferJSON } from '@whiskeysockets/baileys'

import { isAuthPaired, useDbAuthState } from '../../src/baileys/auth-store.js'
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

  it('isAuthPaired mengenali sesi pairing QR (registered false, me terisi)', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })

    expect(await isAuthPaired(connection.db, cipher, sessionId)).toBe(false)

    auth.state.creds.me = { id: '628123456789:1@s.whatsapp.net' }
    await auth.saveCreds()

    expect(await isAuthPaired(connection.db, cipher, sessionId)).toBe(true)
  })

  it('key cache dibuang saat clear sehingga baris baru terbaca', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })

    await auth.state.keys.set({
      session: { s1: 'nilai-lama' },
    } as never)
    expect((await auth.state.keys.get('session', ['s1']))['s1']).toBe('nilai-lama')

    await auth.clear()

    await connection.db.insert(waAuthKeys).values({
      sessionId,
      type: 'session',
      keyId: 's1',
      value: cipher.encrypt(JSON.stringify('nilai-baru', BufferJSON.replacer)),
    })

    const value = (await auth.state.keys.get('session', ['s1']))['s1']
    expect(value).toBe('nilai-baru')
  })

  it('tiga tipe key lid-mapping, device-list, tctoken tersimpan dan terbaca ulang', async () => {
    const sessionId = await insertSession()
    const auth = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })

    await auth.state.keys.set({
      'lid-mapping': { lid1: 'pn1' },
      'device-list': { dev1: Buffer.from('device') },
      tctoken: { tok1: Buffer.from('token') },
    } as never)

    const reloaded = await useDbAuthState(sessionId, { db: connection.db, cipher, logger })
    const lid = await reloaded.state.keys.get('lid-mapping', ['lid1'])
    const device = await reloaded.state.keys.get('device-list', ['dev1'])
    const token = await reloaded.state.keys.get('tctoken', ['tok1'])

    expect(lid['lid1']).toBe('pn1')
    expect(device['dev1']).toBeDefined()
    expect(token['tok1']).toBeDefined()

    const types = await connection.db
      .select({ type: waAuthKeys.type })
      .from(waAuthKeys)
    expect(new Set(types.map((row) => row.type))).toEqual(
      new Set(['lid-mapping', 'device-list', 'tctoken']),
    )
  }
)
})
